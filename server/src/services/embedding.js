const config = require('../config');

/**
 * 批量把文本转成向量
 * @param {string[]} texts 要向量化的文本数组
 * @returns {Promise<number[]>} 向量数组（bge-m3 是 1024 维）
 */
async function getEmbeddings(texts) {
  const res = await fetch(config.EMBEDDING_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.EMBEDDING_API_KEY}`,
    },
    body: JSON.stringify({
      input: texts,                     // 要向量化的文本
      model: config.EMBEDDING_MODEL    // 指定模型 BAAI/bge-m3
    })
  })

  if (!res.ok) {
    const detail = await res.text()
    console.error(`[Embedding 上游错误 ${res.status}]`, detail.slice(0, 500))
    throw new Error(`向量化失败（${res.status}）`)
  }

  const data = await res.json()
  return data.data                                             // data 是个数组：每项 { embedding, index }
    .sort((a, b) => a.index - b.index)                         // 按 index 排序，保证顺序和传入一致
    .map(item => item.embedding)                               // 只取向量，丢掉 index
}

/**
 * 单条文本向量化（内部复用批量版）
 * @param {string} text 要向量化的文本
 * @returns {Promise<number[]>} 向量数组
 */

async function getEmbedding(text) {
  const [vec] = await getEmbeddings([text])    // 包成单元素数组调用批量版
  return vec                                   // 解构取第一条
}



module.exports = { getEmbedding, getEmbeddings }