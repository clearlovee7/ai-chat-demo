<template>
  <div class="chat-page">
    <SideNav />

    <div class="chat-main">
      <header class="chat-top">
        <div class="top-info">
          <h2 class="top-title">对话</h2>
          <span class="top-meta">{{ messages.length }} 条</span>
        </div>
        <el-button size="small" text @click="clearChat">清空对话</el-button>
      </header>

      <main class="chat" ref="chatBox">
        <div v-if="messages.length === 0" class="empty">
          <div class="empty-mark">◇</div>
          <p class="empty-title">开始一段对话</p>
          <p class="empty-tip">Enter 发送 · Shift + Enter 换行</p>
        </div>

        <template v-for="(msg, i) in messages" :key="i">
          <div v-if="msg.role === 'user'" class="row user">
            <div class="bubble user-bubble">{{ msg.content }}</div>
          </div>

          <template v-else>
            <details
              v-if="msg.thinking"
              class="thinking-box"
              :open="loading && i === messages.length - 1"
            >
              <summary>深度思考</summary>
              <div class="thinking-body">{{ msg.thinking }}</div>
            </details>

            <div class="row ai">
              <div class="bubble ai-bubble" :class="{ 'bubble-error': msg.isError }">
                <template v-if="msg.isError">{{ msg.content }}</template>
                <div
                  v-else-if="msg.content"
                  class="md-body"
                  v-html="renderMarkdown(msg.content)"
                ></div>
                <span v-else class="thinking-hint">正在思考</span>
                <span
                  v-if="loading && i === messages.length - 1 && msg.content"
                  class="cursor"
                ></span>
              </div>
            </div>

            <details v-if="msg.references?.length" class="refs-box">
              <summary>参考来源 · {{ msg.references.length }} 段</summary>
              <div class="refs-list">
                <div v-for="(r, ri) in msg.references" :key="ri" class="ref-item">
                  <span class="ref-score">{{ r.score.toFixed(3) }}</span>
                  <span class="ref-text">{{ r.text }}</span>
                </div>
              </div>
            </details>
          </template>
        </template>
      </main>

      <footer class="input-bar">
        <div class="input-row">
          <textarea
            v-model="input"
            placeholder="输入你的问题…"
            @keydown.enter.exact.prevent="ask"
          ></textarea>

          <el-button v-if="!loading" type="primary" :disabled="!input.trim()" @click="ask">
            发送
          </el-button>
          <el-button v-else @click="stop">停止</el-button>
        </div>
        <div class="input-hint">Enter 发送 · Shift + Enter 换行</div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.min.css'

import SideNav from '@/components/SideNav.vue'
import type { ChatMessage, SseChunk } from '@/types/chat'

// ---------- 状态 ----------
const input = ref('')
const messages = ref<ChatMessage[]>(loadMessages())
const loading = ref(false)
const chatBox = ref<HTMLElement | null>(null)
let controller: AbortController | null = null

// 从 localStorage 恢复历史，首次进来是空数组
function loadMessages(): ChatMessage[] {
  const saved = localStorage.getItem('chat_messages')
  return saved ? (JSON.parse(saved) as ChatMessage[]) : []
}

// Markdown 渲染 + XSS 过滤
function renderMarkdown(text: string): string {
  if (!text) return ''
  const html = marked.parse(text) as string
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
}

// 发送并接收流式回答
async function ask() {
  if (!input.value.trim() || loading.value) return

  const text = input.value
  input.value = ''

  messages.value.push({ role: 'user', content: text })
  messages.value.push({ role: 'assistant', content: '', thinking: '', references: [] })

  // 持有刚 push 的那条 AI 消息，后面直接改它（避开索引访问的类型问题）
  const reply = messages.value[messages.value.length - 1]!

  loading.value = true
  controller = new AbortController()

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.value.slice(0, -1) }),
      signal: controller.signal,
    })

    // res.body 的类型是 ReadableStream | null，先排掉 null
    if (!res.body) throw new Error('响应没有 body')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // pop 可能返回 undefined

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue

        const data = line.slice(6).trim()
        if (data === '[DONE]') continue

        try {
          const json = JSON.parse(data) as SseChunk

          // 后端推的错误
          if (json.error) {
            reply.content = '❌ ' + json.error
            reply.isError = true
            continue
          }

          // 引用来源
          if (json.type === 'references') {
            reply.references = json.items ?? []
            continue
          }

          const delta = json.choices?.[0]?.delta
          if (delta?.reasoning_content) {
            reply.thinking = (reply.thinking ?? '') + delta.reasoning_content
          }
          if (delta?.content) {
            reply.content += delta.content
          }
        } catch {
          // 半截 JSON，忽略这帧
        }
      }
    }
  } catch (err) {
    // TS 里 catch 到的是 unknown，要断言才能取属性
    if ((err as Error).name === 'AbortError') {
      reply.content += '\n\n[已停止]'
    } else {
      reply.content += '\n\n❌ ' + (err as Error).message
    }
  } finally {
    controller = null
    loading.value = false
  }
}

// 停止生成
function stop() {
  controller?.abort()
}

// 清空对话
function clearChat() {
  messages.value = []
  localStorage.removeItem('chat_messages')
}

// 消息变化时：滚到底部 + 存本地 + 代码高亮
watch(
  messages,
  async () => {
    await nextTick()

    if (chatBox.value) {
      chatBox.value.scrollTop = chatBox.value.scrollHeight
    }

    localStorage.setItem('chat_messages', JSON.stringify(messages.value))

    chatBox.value?.querySelectorAll('pre code:not(.hljs)').forEach((el) => {
      hljs.highlightElement(el as HTMLElement)
    })
  },
  { deep: true }, // 必须 deep，否则监听不到数组内部对象的变化
)
</script>

<style lang="scss">
.chat-page {
  width: 100%;
  height: 100vh;
  background: var(--bg);
  display: flex;
  overflow: hidden;
}

.chat-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* ---------- 顶栏 ---------- */
.chat-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 54px;
  padding: 0 24px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.top-info {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.top-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: .01em;
}

.top-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

/* ---------- 消息区 ---------- */
.chat {
  flex: 1;
  overflow-y: auto;
  padding: 26px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scroll-behavior: smooth;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--line-2);
    border: 2px solid var(--bg);
    border-radius: 4px;
  }
}

/* ---------- 空状态 ---------- */
.empty {
  margin: auto;
  text-align: center;
}

.empty-mark {
  font-size: 28px;
  line-height: 1;
  color: var(--text-3);
  margin-bottom: 16px;
}

.empty-title {
  font-size: 14px;
  color: var(--text-2);
  margin-bottom: 9px;
}

.empty-tip {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

/* ---------- 消息 ---------- */
.row {
  display: flex;
  animation: rise .3s cubic-bezier(.2, .8, .3, 1) both;

  &.user {
    justify-content: flex-end;
  }

  &.ai {
    justify-content: flex-start;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.bubble {
  max-width: 78%;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.user-bubble {
  background: var(--accent);
  color: #1a1206;
  font-weight: 500;
  border-bottom-right-radius: 4px;
}

.ai-bubble {
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  border-bottom-left-radius: 4px;
}

.bubble-error {
  background: rgba(255, 107, 107, .09);
  border-color: rgba(255, 107, 107, .28);
  color: var(--danger);
}

.thinking-hint {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--text-3);
}

/* ---------- 思考块 ---------- */
.thinking-box {
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 2px solid var(--line-2);
  border-radius: 10px;
  padding: 11px 15px;
  font-size: 12.5px;
  color: var(--text-2);

  summary {
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: .04em;
    color: var(--text-3);
    user-select: none;
    list-style: none;

    &::before {
      content: '▸ ';
    }
  }

  &[open] summary::before {
    content: '▾ ';
  }
}

.thinking-body {
  margin-top: 8px;
  line-height: 1.75;
  white-space: pre-wrap;
}

/* ---------- 打字光标 ---------- */
.cursor {
  display: inline-block;
  width: 7px;
  height: 15px;
  margin-left: 3px;
  border-radius: 1px;
  background: var(--accent);
  vertical-align: -2px;
  animation: blink 1s steps(2) infinite;
}

@keyframes blink {

  0%,
  50% {
    opacity: 1;
  }

  51%,
  100% {
    opacity: 0;
  }
}

/* ---------- 输入栏 ---------- */
.input-bar {
  flex-shrink: 0;
  padding: 16px 22px 14px;
  border-top: 1px solid var(--line);
  background: var(--surface);
}

.input-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.input-bar textarea {
  flex: 1;
  min-height: 46px;
  max-height: 130px;
  padding: 12px 15px;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.55;
  resize: none;
  outline: none;
  transition: border-color .15s, box-shadow .15s;

  &::placeholder {
    color: var(--text-3);
  }

  &:focus {
    border-color: var(--accent-line);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }
}

.input-hint {
  margin-top: 9px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: .02em;
  color: var(--text-3);
}

/* ---------- 参考来源 ---------- */
.refs-box {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 11px 15px;
  font-size: 12.5px;
  color: var(--text-2);

  summary {
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: .04em;
    color: var(--accent);
    opacity: .85;
    user-select: none;
    list-style: none;

    &::before {
      content: '▸ ';
    }
  }

  &[open] summary::before {
    content: '▾ ';
  }
}

.refs-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 11px;
}

.ref-item {
  display: flex;
  gap: 12px;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 8px;
}

.ref-score {
  flex-shrink: 0;
  padding-top: 1px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
}

.ref-text {
  min-width: 0;
  max-height: 110px;
  overflow-y: auto;
  color: var(--text-2);
  line-height: 1.7;
  white-space: pre-wrap;
}

/* ---------- Markdown ---------- */
.md-body {
  white-space: normal;

  :first-child {
    margin-top: 0;
  }

  :last-child {
    margin-bottom: 0;
  }

  p {
    margin: 0 0 10px;
  }

  h1,
  h2,
  h3 {
    margin: 18px 0 9px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--text);
  }

  h1 {
    font-size: 18px;
  }

  h2 {
    font-size: 16px;
  }

  h3 {
    font-size: 14.5px;
  }

  ul,
  ol {
    margin: 0 0 10px;
    padding-left: 20px;
  }

  li {
    margin: 5px 0;
  }

  code {
    padding: 1px 6px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--surface-3);
    color: var(--accent-2);
    font-family: var(--font-mono);
    font-size: 12.5px;
  }

  pre {
    margin: 0 0 12px;
    padding: 13px 15px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg);
    overflow-x: auto;

    code {
      padding: 0;
      border: none;
      background: none;
      color: var(--text);
      font-size: 12.5px;
      line-height: 1.7;
    }
  }

  blockquote {
    margin: 0 0 10px;
    padding-left: 13px;
    border-left: 2px solid var(--line-2);
    color: var(--text-2);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 12px;
    font-size: 13px;
  }

  th,
  td {
    padding: 7px 11px;
    border: 1px solid var(--line);
    text-align: left;
  }

  th {
    background: var(--surface-3);
    font-weight: 600;
    color: var(--text);
  }

  a {
    color: var(--accent);
    text-decoration: none;
    border-bottom: 1px solid var(--accent-line);

    &:hover {
      border-bottom-color: var(--accent);
    }
  }
}
</style>
