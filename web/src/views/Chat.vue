<template>
  <div class="chat-page">
    <Header />

    <div class="chat-toolbar">
      <button class="clear-btn" @click="clearChat">清空对话</button>
    </div>

    <main class="chat" ref="chatBox">

      <div v-if="messages.length === 0" class="empty">
        输入一个问题，试试流式输出<br>
        <span style="font-size:12px">回答会一个字一个字蹦出来</span>
      </div>

      <template v-for="(msg, i) in messages" :key="i">

        <div v-if="msg.role === 'user'" class="row user">
          <div class="bubble user-bubble">{{ msg.content }}</div>
        </div>

        <template v-else>
          <details v-if="msg.thinking" class="thinking-box" :open="loading && i === messages.length - 1">
            <summary>深度思考</summary>
            <div class="thinking-body">{{ msg.thinking }}</div>
          </details>

          <div class="row ai">
            <div class="bubble ai-bubble" :class="{ 'bubble-error': msg.isError }">

              <template v-if="msg.isError">{{ msg.content }}</template>

              <div v-else-if="msg.content" class="md-body" v-html="renderMarkdown(msg.content)"></div>

              <span v-else style="color:#9aa4b2">正在思考...</span>

              <span v-if="loading && i === messages.length - 1 && msg.content" class="cursor"></span>

            </div>
          </div>

          <details v-if="msg.references?.length" class="refs-box">
            <summary>参考来源 · {{ msg.references.length }} 段</summary>
            <div class="refs-list">
              <div v-for="(r, ri) in msg.references" :key="ri" class="ref-item">
                <div class="ref-score">相似度 {{ r.score.toFixed(3) }}</div>
                <div class="ref-text">{{ r.text }}</div>
              </div>
            </div>
          </details>
        </template>

      </template>

    </main>

    <footer class="input-bar">
      <textarea v-model="input" placeholder="输入你的问题，Enter 发送，Shift + Enter 换行"
        @keydown.enter.exact.prevent="ask"></textarea>

      <button @click="ask" :disabled="loading" v-if="!loading">
        {{ loading ? '生成中' : '发送' }}
      </button>
      <button v-else @click="stop">停止</button>
    </footer>

  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.min.css'

import Header from '@/components/Header.vue'
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
  max-width: 760px;
  height: calc(100vh - 48px);
  max-height: 860px;
  margin: 24px auto;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 10px 22px 0;
  flex-shrink: 0;
}

.clear-btn {
  padding: 5px 12px;
  border: 1px solid var(--border-input);
  border-radius: 8px;
  background: #fff;
  color: var(--text-muted);
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;

  &:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
}

.chat {
  flex: 1;
  overflow-y: auto;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scroll-behavior: smooth;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: #d8dee8;
    border-radius: 3px;
  }
}

.empty {
  margin: auto;
  color: #b3bcc9;
  font-size: 14px;
  text-align: center;
  line-height: 2.2;
}

.row {
  display: flex;

  &.user {
    justify-content: flex-end;
  }

  &.ai {
    justify-content: flex-start;
  }
}

.bubble {
  max-width: 78%;
  padding: 11px 15px;
  border-radius: 14px;
  font-size: 14.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.user-bubble {
  background: var(--primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.ai-bubble {
  background: var(--bg-hover);
  color: var(--text-body);
  border-bottom-left-radius: 4px;
}

.bubble-error {
  background: #fff2f0;
  color: #d93026;
}

.thinking-box {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-left: 3px solid #c9d3e2;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  color: #8b96a5;

  summary {
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    color: #a7b0bd;
    letter-spacing: .5px;
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
  margin-top: 6px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.cursor {
  display: inline-block;
  width: 2px;
  height: 15px;
  background: var(--primary);
  vertical-align: -2px;
  margin-left: 2px;
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

.input-bar {
  display: flex;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid var(--border);
  background: #fafbfc;
  flex-shrink: 0;
  align-items: flex-end;

  textarea {
    flex: 1;
    height: 46px;
    max-height: 120px;
    padding: 12px 14px;
    border: 1px solid var(--border-input);
    border-radius: 10px;
    font-size: 14px;
    font-family: inherit;
    resize: none;
    outline: none;
    line-height: 1.5;
    background: #fff;
    color: var(--text-body);

    &:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(64, 158, 255, .12);
    }
  }

  button {
    height: 46px;
    padding: 0 22px;
    border: none;
    border-radius: 10px;
    background: var(--primary);
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    flex-shrink: 0;

    &:hover:not(:disabled) {
      background: var(--primary-hover);
    }

    &:disabled {
      background: #c3d9f0;
      cursor: not-allowed;
    }
  }
}

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
    margin: 16px 0 8px;
    font-weight: 600;
    line-height: 1.4;
  }

  h1 {
    font-size: 19px;
  }

  h2 {
    font-size: 17px;
  }

  h3 {
    font-size: 15px;
  }

  ul,
  ol {
    margin: 0 0 10px;
    padding-left: 22px;
  }

  li {
    margin: 4px 0;
  }

  code {
    background: #eef1f6;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
    font-family: Consolas, Monaco, monospace;
  }

  pre {
    background: #f6f8fa;
    border: 1px solid #e6e9ef;
    border-radius: 8px;
    padding: 12px 14px;
    overflow-x: auto;
    margin: 0 0 10px;

    code {
      background: none;
      padding: 0;
      font-size: 13px;
      line-height: 1.6;
    }
  }

  blockquote {
    border-left: 3px solid #d8dee8;
    padding-left: 12px;
    margin: 0 0 10px;
    color: var(--text-muted);
  }

  table {
    border-collapse: collapse;
    margin: 0 0 10px;
    font-size: 13.5px;
  }

  th,
  td {
    border: 1px solid var(--border-input);
    padding: 6px 10px;
  }

  th {
    background: var(--bg-hover);
    font-weight: 600;
  }

  a {
    color: var(--primary);
  }
}

.refs-box {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 14px;
  margin: 6px 4px 0;
  font-size: 12.5px;
  color: #8b96a5;

  summary {
    cursor: pointer;
    font-weight: 600;
    color: #a7b0bd;
    letter-spacing: .5px;
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

.ref-item {
  margin-top: 8px;
  padding-left: 10px;
  border-left: 2px solid #e4e9f2;
}

.ref-score {
  font-size: 11.5px;
  color: var(--text-hint);
  margin-bottom: 3px;
}

.ref-text {
  color: var(--text-muted);
  line-height: 1.65;
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
}
</style>
