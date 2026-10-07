# AI 流式对话应用（含 RAG 知识库检索）

基于 Vue3 + Express 的 AI 对话应用，实现了 **SSE 流式输出**、**多轮上下文对话**、**生成中断** 等核心能力，并搭建了完整的 **RAG 检索链路**（切片 → 向量化 → 向量库 → 相似度检索 → 引用来源展示）。

前端 Vite + Vue3 + TypeScript 工程，后端 Node.js + Express，通过自有 BFF 层转发大模型请求 —— **API Key 不暴露给浏览器**。

## 功能

- **SSE 流式输出** —— 回答逐字显示，带打字光标动画
- **多轮对话** —— 携带上下文历史，支持截断控制 token 消耗
- **生成中断** —— 前端点击停止后，后端同步取消上游请求，避免无效 token 消耗
- **深度思考展示** —— 推理模型的思考链折叠面板，生成中自动展开、完成后自动收起
- **Markdown 渲染** —— 支持标题 / 列表 / 表格 / 代码块，代码块语法高亮，经 DOMPurify 过滤防 XSS
- **对话历史持久化** —— 存入 localStorage，刷新页面不丢失，支持一键清空
- **错误分层处理** —— 详细错误进服务端日志，界面只展示用户能读懂的提示
- **分层架构** —— routes / controllers / services / config 四层，更换模型服务商只需改一处配置
- **RAG 知识库检索** —— 文档切片 → 向量化入库 → 余弦相似度检索，带相似度阈值过滤（切片策略演进见下文）
- **引用来源展示** —— 回答下方可展开查看命中的原文片段与相似度分数
- **知识库上传界面** —— 前端拖拽上传 `.md` / `.txt`，可选「追加到现有库」或「清空重建」，自动切片入库

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue3 + TypeScript + Vite |
| 前端路由 | Vue Router（对话页 / 知识库页） |
| UI 组件库 | Element Plus |
| 前端样式 | scss + CSS 变量色板 |
| 前端渲染 | marked（Markdown 解析）+ DOMPurify（XSS 过滤）+ highlight.js（代码高亮） |
| 后端 | Node.js + Express（只提供 API） |
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

项目依次实现并实测了三版切法，代码保留在 `server/src/rag/chunk.js` 中作为对比。

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

### 相似度阈值：向量检索没有「及格线」

余弦相似度只会**排序取前几**，不会告诉你"够不够像"。库里没有相关内容时，它照样能返回"最像的 3 条" —— 只是分数偏低。

实测同一份知识库的真实分数分布：

| 查询 | Top1 | Top2 | Top3 |
| --- | --- | --- | --- |
| `这个项目为什么需要 buffer`（相关） | 0.6489 | 0.6268 | 0.6012 |
| `今天天气怎么样`（不相关） | 0.4126 | 0.4087 | 0.4025 |
| `你会做红烧肉吗`（不相关） | 0.3452 | 0.3345 | 0.3320 |

相关在 0.60 以上、不相关在 0.42 以下，分界清晰。所以加一个阈值 `RAG_MIN_SCORE: 0.5`（两边各留约 0.09 余量）：

```js
return scored
  .slice(0, topK)
  .filter(x => x.score >= minScore)     // 滤掉"不够像"的
```

**没有这道过滤会怎样**：问"今天天气"，模型回答"根据已有资料无法回答"，**但页面照样显示 3 段参考来源** —— 用户会困惑"你到底参考了什么"。引用来源和实际命中必须一致。

### 检索不到时怎么办：严格模式 vs 降级模式

**这是 RAG 产品必须显式决定的一件事** —— 检索为空时，让模型说"不知道"，还是让它用自己的知识兜底？

**降级模式（本项目采用）**：检索到内容才注入系统提示和参考资料；检索为空则不注入，模型按普通对话回答。

```js
if (hits.length) {                          // ★ 只有命中才注入约束与资料
  refs = hits
  const context = hits.map((h, i) => `【片段 ${i + 1}】\n${h.text}`).join('\n\n')

  payload = [
    { role: 'system', content: RAG_SYSTEM_PROMPT.replace('{context}', context) },
    ...messages
  ]
}
// 检索为空 → payload 保持原样 → 模型用自己的知识兜底
```

**严格模式**：无论有没有命中都注入约束，检索为空时 `context` 填一句"（没有检索到相关资料）"，模型会回答"根据已有资料无法回答"。

| 模式 | 行为 | 适合场景 |
| --- | --- | --- |
| 严格模式 | 永远带"仅根据资料回答"的约束，库里没有就说不知道 | 客服 / 专业问答 —— **答案可信度 > 覆盖面** |
| **降级模式**（本项目） | 命中时基于资料回答，未命中时用通用知识兜底 | 通用助手 —— 覆盖面与体验更顺 |

**判断依据：用户能不能承受一个不在知识库里的答案。**

- **客服场景**：AI 的答案会被拿去回复客户，答错要担责 → 必须严格
- **本项目定位是「通用对话助手 + 知识库增强」** → 选降级：项目相关的问题基于资料回答并附引用，常规问题（常识、网址这类）也能正常应对

**阈值与降级是配套的两个机制**：

- **阈值**负责"不乱给引用" —— 未命中就不显示参考来源
- **降级**负责"不拒答" —— 未命中仍能正常对话

两者合起来的效果：**有资料时答案可信且可追溯；没资料时退化成普通助手，但不会假装有依据。**

### 引用来源怎么传给前端

引用数据不是回答文本的一部分，而是**独立的一条 SSE 事件**，在回答开始前先推给前端：

```js
// 后端：SSE 响应头设置之后，模型流开始之前
if (refs.length) {
  res.write(`data: ${JSON.stringify({
    type: 'references',                     // 自定义事件类型，前端靠它识别
    items: refs.map(h => ({ text: h.text, score: h.score }))
  })}\n\n`)                                 // ★ 结尾两个换行，否则前端切不出完整行
}
```

```js
// 前端：解析时先分流
if (json.type === 'references') {           // 是引用事件 → 存到这条消息上
  messages.value[idx].references = json.items
  continue                                  // 跳过后续正文解析
}
const delta = json.choices?.[0]?.delta      // 才是正常内容
```

**为什么单独走一条事件**：引用数据里没有 `choices` 字段，如果混在正文解析逻辑里会被静默丢掉（`json.choices?.[0]?.delta` 得到 `undefined`，两个 `if` 都不进，什么都不发生）。**这是实现时真实踩过的坑** —— 表现为"引用来源一直不显示，但控制台也没有任何报错"。

## 项目结构

```
create-AI/
├── web/                              # 前端工程（Vite + Vue3 + TypeScript）
│   ├── src/
│   │   ├── App.vue                   # 根组件：RouterView + 全局色板（:root + *）
│   │   ├── main.ts                   # 入口：挂 Router / Element Plus / 图标
│   │   ├── router/index.ts           # 路由表（对话页 / 知识库页）
│   │   ├── components/SideNav.vue    # 侧栏导航（el-menu，各页面自己引入）
│   │   ├── views/
│   │   │   ├── Chat.vue              # 对话页：SSE 流式 + 引用来源
│   │   │   └── Knowledge.vue         # 知识库页：文档上传 → 切片 → 入库
│   │   └── types/                    # 前后端数据契约
│   │       ├── chat.ts               # ChatMessage / SseChunk / RefItem
│   │       └── knowledge.ts          # IngestMode / IngestResult / StoreInfo
│   ├── vite.config.ts                # @ 别名 + /api 代理到后端
│   └── package.json
├── server/                           # 后端（只提供 API）
│   ├── index.js                      # 组装与启动
│   ├── src/
│   │   ├── config.js                 # 配置集中管理（接口地址 / 模型 / 密钥 / 截断条数）
│   │   ├── services/
│   │   │   ├── llm.js                # 调用大模型（流式转发）
│   │   │   └── embedding.js          # 文本向量化（支持批量）
│   │   ├── rag/
│   │   │   ├── chunk.js              # 文本切片（三版实现保留对比）
│   │   │   └── store.js              # 向量库读写 + 余弦相似度检索
│   │   ├── controllers/
│   │   │   ├── chat.js               # SSE 业务逻辑（响应头 / 中断 / 错误处理）
│   │   │   └── ingest.js             # 入库：切片 → 批量向量化 → 合并存库
│   │   └── routes/
│   │       ├── chat.js               # 对话路由
│   │       └── ingest.js             # 入库 + 库状态路由
│   ├── scripts/
│   │   └── search.js                 # 检索调试工具（命令行查相似片段）
│   ├── data/store.json               # 向量库（已被 .gitignore 排除）
│   └── .env                          # 环境变量（已被 .gitignore 排除）
├── AGENTS.md                         # 开发协作规范
└── README.md
```

**分层原则**（后端）：依赖单向流动 `routes → controllers → services → config`。

- 替换模型服务商 → 只改 `server/src/config.js`
- 新增接口 → 新增一个 route + controller
- 换用别的 SDK → 只改 `server/src/services/llm.js`
- 换 embedding 服务 → 只改 `server/src/services/embedding.js`

**前端组织**：`App.vue` 只保留 `<RouterView>` 和全局色板（`:root` + `*`），页面级的结构和样式都写在各自的 `views/*.vue` 里；公共组件放 `components/`。

## 本地运行

### 1. 装依赖（两端各一次）

```bash
cd server && npm install
cd ../web && npm install
```

### 2. 配置环境变量

在 `server/` 下新建 `.env`：

```
DEEPSEEK_API_KEY=你的对话模型密钥
SILICONFLOW_API_KEY=你的向量化服务密钥
```

> ⚠️ `.env` 已被 `.gitignore` 排除，不会提交到仓库。

### 3. 修改接口配置

编辑 `server/src/config.js`，填入你的对话接口与向量化服务地址：

```js
LLM_BASE_URL: '你的对话接口地址',
LLM_MODEL: '你的对话模型名',
EMBEDDING_URL: '你的向量化接口地址',
EMBEDDING_MODEL: '你的向量化模型名'
```

### 4. 建库（RAG 必需）

> 入库走前端界面，所以要**先启动前后端**（见第 6 步）。

启动后打开 `http://localhost:5173`，进入左侧「知识库」页：

1. 拖入 `.md` / `.txt` 文件
2. 选入库模式：**追加到现有库** / **清空重建**
3. 点「开始入库」，等它跑完（片段越多越慢，向量化按每批 16 条送）

产物写入 `server/data/store.json`。**改了切片策略必须用「清空重建」重新建库** —— 库里的向量是用旧策略生成的，不重建不会更新。

### 5. 验证检索

```bash
cd server
node scripts/search.js "你的问题"
```

输出相似度最高的 3 个片段。**检索不准时先看片段开头是不是残句** —— 那说明切片策略需要调整。

### 6. 启动（两个终端）

```bash
# 终端 1 · 后端（提供 /api）
cd server
node index.js                  # http://localhost:3000

# 终端 2 · 前端
cd web
npm run dev                    # http://localhost:5173
```

浏览器打开 **`http://localhost:5173`**。

前端通过 Vite proxy 把 `/api` 转发到后端 3000 端口 —— 开发期同源、无需 CORS，后端也不用装 `cors`。

## 已知限制

- 上下文按**条数**截断（`slice(-10)`），未按 token 数精确控制
- 检索为**单阶段纯向量粗排**，未接入 Rerank 精排
- **相似度阈值 0.4 与切片粒度 300 字都是实测出来的经验值** —— 换 embedding 模型或换文档类型需要重新标定
- 向量库为本地 JSON 文件，未使用专业向量数据库（无索引加速、无元数据过滤）
- 对话历史存于 localStorage，**换浏览器 / 设备不共享**
- 上传仅支持 `.md` / `.txt`（PDF / Word 是二进制格式，需要额外的解析库）
- 前端 Element Plus 为**全量引入**，未做按需优化（打包体积偏大）
- 组件样式暂未加 `scoped`（Markdown 的 `v-html` 内容需要 `:deep()` 配合才不失效）
- 未实现错误重试与断点续传

## 后续计划

- [ ] **Rerank 重排序** —— 向量召回 top20 → Rerank 精排 top3。阈值是简化替代方案，库变大后噪音增多需要真正的精排
- [ ] 前端样式隔离：`scoped` + `:deep()` 处理 v-html 渲染的内容
- [ ] Element Plus 改按需引入（当前全量，体积可优化）
- [ ] 按 token 数精确截断上下文
- [ ] 错误自动重试（429 / 503 场景）
- [ ] 向量化结果缓存（相同文本不重复请求）
