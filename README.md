# AI 流式对话应用

基于 Vue3 + Express 的 AI 对话应用，实现了 **SSE 流式输出**、**多轮上下文对话**、**生成中断** 等核心能力。

前端零构建（Vue3 CDN 引入），后端 Node.js + Express，通过自有 BFF 层转发大模型请求 —— **API Key 不暴露给浏览器**。

## 功能

- **SSE 流式输出** —— 回答逐字显示，带打字光标动画
- **多轮对话** —— 携带上下文历史，支持截断控制 token 消耗
- **生成中断** —— 前端点击停止后，后端同步取消上游请求，避免无效 token 消耗
- **深度思考展示** —— 推理模型的思考链折叠面板，生成中自动展开、完成后自动收起
- **错误分层处理** —— 详细错误进服务端日志，界面只展示用户能读懂的提示
- **分层架构** —— routes / controllers / services / config 四层，更换模型服务商只需改一处配置

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue3（CDN 引入，无需构建）+ Fetch Stream API |
| 后端 | Node.js + Express |
| AI 接口 | OpenAI 兼容格式（SSE 流式） |

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

## 项目结构

```
create-AI/
├── index.js                    # 组装与启动（16 行）
├── src/
│   ├── config.js               # 配置集中管理（接口地址 / 模型 / 密钥 / 截断条数）
│   ├── services/
│   │   └── llm.js              # 调用大模型的能力封装
│   ├── controllers/
│   │   └── chat.js             # SSE 业务逻辑（响应头 / 中断 / 错误处理）
│   └── routes/
│       └── chat.js             # 路由声明
├── public/
│   └── index.html              # 前端页面（Vue3 + 全量逻辑）
└── .env                        # 环境变量（已被 .gitignore 排除）
```

**分层原则**：依赖单向流动 `routes → controllers → services → config`。

- 替换模型服务商 → 只改 `config.js`
- 新增接口 → 新增一个 route + controller
- 换用别的 SDK → 只改 `services/llm.js`

## 本地运行

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录新建 `.env`：

```
DEEPSEEK_API_KEY=你的密钥
```

> ⚠️ `.env` 已加入 `.gitignore`，不会被提交到仓库。

### 3. 修改接口配置

编辑 `src/config.js`，填入你的模型服务地址与模型名：

```js
LLM_BASE_URL: '你的接口地址',
LLM_MODEL: '你的模型名'
```

### 4. 启动

```bash
node index.js
```

浏览器打开 `http://localhost:3000`

## 已知限制

- 对话历史仅存在于浏览器内存，**刷新页面会丢失**（未接入持久化存储）
- 上下文按**条数**截断（`slice(-10)`），未按 token 数精确控制
- 未实现错误重试与断点续传

## 后续计划

- [ ] 对话历史持久化（数据库 / 本地存储）
- [ ] Markdown 渲染与代码高亮
- [ ] 按 token 数精确截断上下文
- [ ] 错误自动重试（429/503 场景）
