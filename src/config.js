const crypto = require('crypto');  //生成uuid

module.exports = {
  PORT: 3000,

  // 语言模型接口
  LLM_BASE_URL: 'https://opencode.ai/zen/go/v1/chat/completions',
  LLM_MODEL: 'deepseek-v4.1-flash',
  LLM_API_KEY: process.env.DEEPSEEK_API_KEY,
  SESSION_ID: crypto.randomUUID(),
  MAX_HISTORY: 10, // 上下文最多带多少条
  USER_AGENT: 'my-ai-demo/1.0', // OpenCode 要求必须自报家门

  // 向量化接口
  EMBEDDING_URL: 'https://api.siliconflow.cn/v1/embeddings',   // 向量化接口（硅基流动）
  EMBEDDING_MODEL: 'BAAI/bge-m3',                              // 中文效果好的 embedding 模型
  EMBEDDING_API_KEY: process.env.SILICONFLOW_API_KEY,          // 从 .env 读，和对话的 Key 分开
  RAG_TOP_K: 3,                                              // 检索返回几条片段
  RAG_SYSTEM_PROMPT: `你是项目知识助手。请仅根据以下参考资料回答用户问题。
如果参考资料中没有相关信息，直接回答"根据已有资料无法回答"，不要编造。

【参考资料】
{context}`,                                                  // 系统提示词模板（{context} 是占位符）
}