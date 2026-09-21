const crypto = require('crypto');  //生成uuid

module.exports = {
  PORT: 3000,
  LLM_BASE_URL: 'https://opencode.ai/zen/go/v1/chat/completions',
  LLM_MODEL: 'deepseek-v4.1-flash',
  LLM_API_KEY: process.env.DEEPSEEK_API_KEY,
  SESSION_ID: crypto.randomUUID(),
  MAX_HISTORY: 10, // 上下文最多带多少条
  USER_AGENT: 'my-ai-demo/1.0' // OpenCode 要求必须自报家门
}