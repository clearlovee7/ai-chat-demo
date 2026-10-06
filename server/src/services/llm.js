const config = require('../config')

// 状态码 → 用户能看懂的话（放在文件顶部）
const STATUS_HINT = {
  401: '服务配置有误（密钥无效或过期）',
  403: '无权访问该模型服务',
  404: '模型服务地址配置错误',
  429: '请求过于频繁，请稍后再试',
  500: '模型服务暂时不可用，请稍后重试',
  502: '模型服务暂时不可用，请稍后重试',
  503: '模型服务繁忙，请稍后重试'
}

async function streamChat(messages, signal) {
  // ★ 分离处理：系统提示永远保留，对话历史才做截断
  const systemMsgs = messages.filter(m => m.role === 'system')                        // 系统提示：全部保留
  const dialogMsgs = messages.filter(m => m.role !== 'system')                        // 对话消息：先过滤出来
    .slice(-config.MAX_HISTORY)                                     // 只留最近 N 条

  const res = await fetch(config.LLM_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.LLM_API_KEY}`,
      'x-opencode-session': config.SESSION_ID,
      'User-Agent': config.USER_AGENT
    },
    body: JSON.stringify({
      model: config.LLM_MODEL,
      // messages: messages.slice(-config.MAX_HISTORY),
      messages: [...systemMsgs, ...dialogMsgs],        // ★ 系统提示在前 + 截断后的对话
      stream: true
    }),
    signal
  })


  if (!res.ok) {                // ★ 上游返回 4xx/5xx 时主动抛错
    const detail = await res.text()
    console.error(`[上游错误 ${res.status}]`, detail.slice(0, 500))
    throw new Error(STATUS_HINT[res.status] || `模型服务异常（${res.status}）`)
  }

  return res
}

module.exports = { streamChat }