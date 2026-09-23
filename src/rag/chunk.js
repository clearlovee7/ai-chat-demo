/**
 * 把长文本切成带重叠的片段
 * @param {string} text 原始文本
 * @param {number} chunkSize 每个片段的字符数
 * @param {number} overlap 相邻片段的重叠字符数
 * @returns {string[]} 片段数组
 */


function splitText(text, chunkSize = 400, overlap = 80) {
  if (overlap >= chunkSize) {         //重叠不能大于等于片段
    throw new Error('重叠不能大于等于片段，否则会死循环')
  }

  const chunks = []                   //结果数组
  let start = 0                       //起始索引

  while (start < text.length) {          //只要还有未处理的文本
    const end = Math.min(start + chunkSize, text.length)  // 结束位置，但不超过文本长度

    chunks.push(text.slice(start, end))    // 切出这一段（含头不含尾）

    if (end >= text.length) {      // 已经切到末尾，结束
      break
    }

    start = end - overlap       // ★ 回退 overlap 个字符，形成重叠
  }

  return chunks

}

module.exports = { splitText }