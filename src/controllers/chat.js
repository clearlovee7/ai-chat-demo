const { streamChat } = require('../services/llm')
const { search } = require('../rag/store')        // 检索能力
const config = require('../config')               // 配置（要用 RAG_TOP_K 和提示词模板）
async function chat(req, res) {
  const { messages } = req.body

  if (!messages?.length) {
    return res.status(400).json({
      error: '缺少 messages'
    })
  }

  // ---------- ★ 新增：检索 + 组装 payload ----------
  let payload = messages
  const lastUser = [...messages].reverse().find(m => m.role === 'user') // 从后往前找最后一条用户消息
  if (lastUser) {                                                      // 有用户消息才检索
    try {
      const hits = await search(lastUser.content, config.RAG_TOP_K)    // 检索最相关的 N 条
      if (hits.length) {                                               // 检索到内容才拼 prompt
        const context = hits                                             // 把片段拼成文本
          .map((h, i) => `【片段 ${i + 1}】\n${h.text}`)
          .join('\n\n')

        payload = [
          {                                                              // ① 系统提示放最前
            role: 'system',
            content: config.RAG_SYSTEM_PROMPT.replace('{context}', context)   // 把 {context} 替换成检索内容
          },
          ...messages                                                    // ② 后面接上完整对话历史
        ]
        console.log(`🔍 检索到 ${hits.length} 条片段，最高分 ${hits[0].score.toFixed(4)}`)
      }
    } catch (e) {
      console.error('检索失败，降级为普通对话:', e.message)              // ★ 检索挂了不能影响对话
    }
  }

  // ---------- ① 设置 SSE 三件套响应头 ----------
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Contention', 'keep-alive')

  // ---------- ② 中断处理 ----------
  const upstreamController = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) {
      upstreamController.abort()
    }
  })

  // ---------- ③ 转发流 ----------
  try {
    const upstream = await streamChat(payload, upstreamController.signal)

    for await (const chunk of upstream.body) {
      res.write(chunk)
    }
  } catch (e) {
    if (e.name == 'AbortError') {
      console.log('上游已取消（用户停止）')
    } else {
      console.error('请求失败:', e.message)
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`)
      }
    }
  } finally {
    res.end()
  }
}

module.exports = { chat }