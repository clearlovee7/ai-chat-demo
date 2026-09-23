const fs = require('fs');
const path = require('path');
const { getEmbedding } = require('../services/embedding');


const STORE_PATH = path.join(__dirname, '../../data/store.json');


/**
 * 保存向量库到本地文件
 * @param {Array} items [{ text, vector }, ...]
 */

function saveStore(items) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true })  // 目录不存在就创建（recursive 保证多级）
  fs.writeFileSync(STORE_PATH, JSON.stringify(items))           // 写成 JSON 字符串
}


/**
 * 读取本地向量库
 * @returns {Array} 空库时返回空数组
 */

function loadStore() {
  if (!fs.existsSync(STORE_PATH)) return []    // 文件不存在 → 返回空数组，别报错
  return JSON.parse(fs.readFileSync(STORE_PATH))
}


/**
 * 余弦相似度：两个向量的夹角余弦值，范围 -1 ~ 1，越大越相似
 * @param {number[]} a 向量 A
 * @param {number[]} b 向量 B
 * @returns {number} 相似度
 */

function cosineSimilarity(a, b) {
  let dot = 0   // 点积
  let normA = 0  // 向量 A 的模
  let normB = 0  // 向量 B 的模

  for (let i = 0; i < a.length; i++) {   // 逐个计算
    dot += a[i] * b[i]                    // 累加点积
    normA += a[i] * a[i]                   // 累加 A 的平方和
    normB += b[i] * b[i]                   // 累加 B 的平方和
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB))   // 点积 ÷ (模长乘积) = 夹角余弦
}



/**
 * 检索：把问题向量化，跟库里所有向量比相似度，返回最像的 topK 个
 * @param {string} query 用户问题
 * @param {number} topK 返回几条
 */

async function search(query, topK = 1) {
  const queryVector = await getEmbedding(query)  // 把问题向量化
  const store = loadStore()  //读整个库
  if (store.length == 0) return [] // 库为空就返回

  const scored = store.map(item => ({    // 每个片段算一次相似度
    text: item.text,                      //   保留原文（后面要拼进 Prompt）
    score: cosineSimilarity(queryVector, item.vector)    //算出相似度分数
  }))


  scored.sort((a, b) => b.score - a.score)        //从高到低排序

  return scored.slice(0, topK)        // 只取前 topK 条
}

module.exports = { saveStore, loadStore, cosineSimilarity, search }