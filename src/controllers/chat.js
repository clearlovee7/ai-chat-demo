const { streamChat } = require('../services/llm')

async function chat(req, res) {
  const { messages } = req.body

  if (!messages?.length) {
    return res.status(400).json({
      error: '缺少 messages'
    })
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
    const upstream = await streamChat(messages, upstreamController.signal)

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
  }finally{
    res.end()
  }
}

module.exports = { chat }