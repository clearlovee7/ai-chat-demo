# AI 流式对话应用（含 RAG 知识库检索）

基于 Vue3 + Express 的 AI 对话应用，实现了 **SSE 流式输出**、**多轮上下文对话**、**生成中断** 等核心能力，并搭建了完整的 **RAG 检索链路**（切片 → 向量化 → 向量库 → 相似度检索）。

前端零构建（Vue3 CDN 引入），后端 Node.js + Express，通过自有 BFF 层转发大模型请求 —— **API Key 不暴露给浏览器**。

## 功能

- **SSE 流式输出** —— 回答逐字显示，带打字光标动画
- **多轮对话** —— 携带上下文历史，支持截断控制 token 消耗
- **生成中断** —— 前端点击停止后，后端同步取消上游请求，避免无效 token 消耗
- **深度思考展示** —— 推理模型的思考链折叠面板，生成中自动展开、完成后自动收起
- **Markdown 渲染** —— 支持标题 / 列表 / 表格 / 代码块，代码块语法高亮，经 DOMPurify 过滤防 XSS
- **对话历史持久化** —— 存入 localStorage，刷新页面不丢失，支持一键清空
- **错误分层处理** —— 详细错误进服务端日志，界面只展示用户能读懂的提示
- **分层架构** —— routes / controllers / services / config 四层，更换模型服务商只需改一处配置
- **RAG 知识库检索** —— 文档切片 → 向量化入库 → 余弦相似度检索（切片策略演进见下文）

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue3（CDN 引入，无需构建）+ Fetch Stream API |
| 前端渲染 | marked（Markdown 解析）+ DOMPurify（XSS 过滤）+ highlight.js（代码高亮） |
| 后端 | Node.js + Express |
| 对话模型 | OpenAI 兼容格式（SSE 流式） |
| 文本切片 | LangChain `RecursiveCharacterTextSplitter` |
| 向量化 | 硅基流动 `BAAI/bge-m3`（1024 维 Embedding） |
| 向量检索 | 本地 JSON 向量库 + 余弦相似度 |

## 核心实现

### 1. 流式解析：为什么需要 buffer

网络传输的数据块**不按行切分** —— 一行 SSE 数据可能被切成两半，前一半这次到达、后一半下次才到。

所以必须用 `buffer` 暂存不完整的部分：

```js
const reader = res.body.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break

  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop()        // ★ 最后一段可能不完整，留到下一轮再拼

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    const data = line.slice(6).trim()
    if (data === '[DONE]') continue
    // 解析 JSON 并累加到页面
  }
}
```

`buffer = lines.pop()` 是这套逻辑的关键 —— 少了它会出现随机的 JSON 解析失败，且难以复现。

### 2. 生成中断：为什么后端也必须处理

**只做前端 `abort()` 是不够的**：

```js
controller.abort()      // 只是断开了前端的连接
```

前端断开的瞬间，后端的 `fetch` 仍在运行、模型仍在生成、**token 仍在消耗**。

正确的做法是后端感知到客户端断开后，主动取消上游请求：

```js
const upstreamController = new AbortController()

// ★ 注意：Node 16+ 中 req 的 'close' 事件在请求体读完时就会触发
// 必须监听 res，并用 writableEnded 区分「正常结束」和「客户端断开」
res.on('close', () => {
  if (!res.writableEnded) {
    upstreamController.abort()
  }
})

const upstream = await fetch(upstreamUrl, {
  // ...
  signal: upstreamController.signal     // 把取消信号透传给上游
})
```

### 3. 错误分层：日志给开发者，提示给用户

上游返回 4xx/5xx 时，直接展示原始响应（比如一整页 HTML）对用户毫无意义，还可能泄露内部信息。

所以分两层处理：

```js
if (!res.ok) {
  const detail = await res.text()
  console.error(`[上游错误 ${res.status}]`, detail.slice(0, 500))     // ① 详情进日志
  throw new Error(STATUS_HINT[res.status] || `模型服务异常（${res.status}）`)  // ② 给用户人话
}
```

界面收到的是「模型服务地址配置错误」，服务端日志里是完整的原始响应 —— 两边各取所需。

### 4. 上下文截断

大模型是无状态的，多轮对话需要每次把历史消息重新发送。历史越长，token 消耗越大且可能超出上下文窗口。

```js
messages: messages.slice(-10)     // 只携带最近 10 条
```

## RAG 切片策略演进

切片（Chunking）是 RAG 检索质量的第一决定因素 —— **检索不准，通常不是 embedding 模型的问题，而是片段本身就是碎的**。

项目依次实现并实测了三版切法，代码保留在 `src/rag/chunk.js` 中作为对比。

### v1 · 按字符数硬切

从字符 0 开始，每 N 字切一刀，末尾回退 `overlap` 个字符形成重叠。

```js
let start = 0
while (start < text.length) {
  const end = Math.min(start + chunkSize, text.length)
  chunks.push(text.slice(start, end))
  if (end >= text.length) break
  start = end - overlap          // 回退 overlap，形成重叠区
}
```

**问题**：切点完全无视语义结构，片段开头是残句：

```
「叠面板，生成中自动展开、完成后自动收起…」    ← "折叠面板"被切开
「lit('\n')   buffer = lines.pop()」          ← "split('\n')" 的后半截
```

语义单元被劈成两半（解释在一段、代码在下一段），向量表达的意思随之残缺。

### v2 · 按段落切（手写）

先按空行 `\n\s*\n` 切成自然段落，再贪心合并到目标大小，封口时保留末尾 `overlap` 个字符做重叠。

**效果有限** —— 技术文档的主体是**表格和代码块**，它们内部没有空行，会被当成一个超长段落，进而触发函数内的字符硬切分支，**退化成 v1**。

实测同一份文档：按字符切 7 段 / 按段落切 8 段，残句约 4/7 vs 4/8，**差异很小**。

### v3 · 递归字符切分（当前实现）

采用 LangChain 的 `RecursiveCharacterTextSplitter`：按分隔符**优先级递归降级**切分。

```
\n\n（段落） → \n（行） → 。！？（句子） → ；， → 空格 → 字符
```

任何一级切出来的片段仍超长，就降一级继续切 —— 保证**尽量在语义边界断开**，实在没有边界才退到按字符切。

```js
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 600,
  chunkOverlap: 100,
  separators: ['\n\n', '\n', '。', '！', '？', '；', '，', ' ', '']   // ★ 中文必须自定义
})
```

**实测对比（同一份 3449 字文档）**：

| 版本 | 残句开头 | 检索 Top1 |
| --- | --- | --- |
| v1 按字符硬切 | — | 「叠面板…四层架构」，不相关 |
| v2 按段落切 | 5-6 / 8 | 「CDN 引入，无需构建）+ Fetch…」，部分相关 |
| **v3 递归切分** | **2 / 8** | **「### 1. 流式解析：为什么需要 buffer」，精准命中** |

剩余 2 段残句来自长代码块 —— 代码本身没有语义边界，降级到按行切已是合理上限。

### 三条可复用的结论

1. **判断切片质量看「片段开头」，不要看检索分数。** 碎片会让相似度虚高 —— 碎成渣的片段跟什么问题都"有点像"，分数高但没用。
2. **做对比必须控制变量。** 同时改 `chunkSize` 和切法，就无法归因是哪一个起的作用（v1→v3 的对比中就踩过这个坑）。
3. **切片策略要匹配文档结构。** 正文型文档按段落切就够；表格 / 代码为主的文档必须用递归降级切分。

### 向量检索：余弦相似度

检索时把用户问题也向量化，与库中每个片段计算夹角余弦，取分数最高的 topK。

```js
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]              // 点积：对应维度相乘再求和
    normA += a[i] * a[i]            // A 的模长平方
    normB += b[i] * b[i]            // B 的模长平方
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB))     // 点积 ÷ 模长乘积 = 夹角余弦
}
```

**为什么用余弦而不是欧氏距离**：我们只关心"方向是否一致"（语义是否接近），不关心向量长度 —— 余弦天然排除了长度的影响。

**为什么向量库存本地 JSON**：学习项目规模小（几十个片段），JSON 足够直观、零依赖。生产环境会用专业向量数据库（Chroma / Milvus / pgvector），它们提供持久化、索引加速（HNSW / IVF）和元数据过滤。

**当前检索是"单阶段纯向量粗排"** —— 从库里取出 topK 直接交给模型。工业界标准做法是两阶段（向量召回 top20 → Rerank 精排 top3），见「后续计划」。

## 项目结构

```
create-AI/
├── index.js                    # 组装与启动（16 行）
├── src/
│   ├── config.js               # 配置集中管理（接口地址 / 模型 / 密钥 / 截断条数）
│   ├── services/
│   │   ├── llm.js              # 调用大模型（流式转发）
│   │   └── embedding.js        # 文本向量化（支持批量）
│   ├── rag/
│   │   ├── chunk.js            # 文本切片（三版实现保留对比）
│   │   └── store.js            # 向量库读写 + 余弦相似度检索
│   ├── controllers/
│   │   └── chat.js             # SSE 业务逻辑（响应头 / 中断 / 错误处理）
│   └── routes/
│       └── chat.js             # 路由声明
├── scripts/
│   ├── ingest.js               # 建库脚本：读文档 → 切片 → 向量化 → 存库
│   └── search.js               # 检索调试工具（命令行查相似片段）
├── public/
│   └── index.html              # 前端页面（Vue3 + 全量逻辑）
├── data/
│   └── store.json              # 向量库（已被 .gitignore 排除）
└── .env                        # 环境变量（已被 .gitignore 排除）
```

**分层原则**：依赖单向流动 `routes → controllers → services → config`。

- 替换模型服务商 → 只改 `config.js`
- 新增接口 → 新增一个 route + controller
- 换用别的 SDK → 只改 `services/llm.js`
- 换 embedding 服务 → 只改 `services/embedding.js`

## 本地运行

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录新建 `.env`：

```
DEEPSEEK_API_KEY=你的对话模型密钥
SILICONFLOW_API_KEY=你的向量化服务密钥
```

> ⚠️ `.env` 已加入 `.gitignore`，不会被提交到仓库。

### 3. 修改接口配置

编辑 `src/config.js`，填入你的对话接口与向量化服务地址：

```js
LLM_BASE_URL: '你的对话接口地址',
LLM_MODEL: '你的对话模型名',
EMBEDDING_URL: '你的向量化接口地址',
EMBEDDING_MODEL: '你的向量化模型名'
```

### 4. 建库（RAG 必需）

默认读取项目根目录的 `README.md` 作为知识库文档：

```bash
node scripts/ingest.js              # 用默认文档建库
node scripts/ingest.js 文档路径      # 也可以指定其它文件
```

产物写入 `data/store.json`。**改了切片策略必须重新执行本步骤** —— 库里的向量是用旧策略生成的，不重建不会更新。

### 5. 验证检索

```bash
node scripts/search.js "你的问题"
```

输出相似度最高的 3 个片段。**检索不准时先看片段开头是不是残句** —— 那说明切片策略需要调整。

### 6. 启动

```bash
node index.js
```

浏览器打开 `http://localhost:3000`

## 已知限制

- 上下文按**条数**截断（`slice(-10)`），未按 token 数精确控制
- 检索为**单阶段纯向量粗排**，未接入 Rerank 精排
- 向量库为本地 JSON 文件，未使用专业向量数据库（无索引加速、无元数据过滤）
- 对话历史存于 localStorage，**换浏览器 / 设备不共享**
- 未实现错误重试与断点续传

## 后续计划

- [ ] **Rerank 重排序** —— 向量召回 top20 → Rerank 精排 top3，提升检索精度
- [ ] **RAG 接入对话链路** —— 检索结果拼进 Prompt，让回答基于知识库内容
- [ ] **引用来源展示** —— 回答下方显示命中的原文片段
- [ ] 文档上传界面（当前只能命令行建库）
- [ ] 按 token 数精确截断上下文
- [ ] 错误自动重试（429 / 503 场景）
- [ ] 向量化结果缓存（相同文本不重复请求）
