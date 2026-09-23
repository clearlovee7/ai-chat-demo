/**
 * 把长文本切成带重叠的片段
 * @param {string} text 原始文本
 * @param {number} chunkSize 每个片段的字符数
 * @param {number} overlap 相邻片段的重叠字符数
 * @returns {string[]} 片段数组
 */


// function splitText(text, chunkSize = 400, overlap = 80) {
//   if (overlap >= chunkSize) {         //重叠不能大于等于片段
//     throw new Error('重叠不能大于等于片段，否则会死循环')
//   }

//   const chunks = []                   //结果数组
//   let start = 0                       //起始索引

//   while (start < text.length) {          //只要还有未处理的文本
//     const end = Math.min(start + chunkSize, text.length)  // 结束位置，但不超过文本长度

//     chunks.push(text.slice(start, end))    // 切出这一段（含头不含尾）

//     if (end >= text.length) {      // 已经切到末尾，结束
//       break
//     }

//     start = end - overlap       // ★ 回退 overlap 个字符，形成重叠
//   }

//   return chunks

// }

// function splitText(text, chunkSize = 400, overlap = 80) {
//   const paragraphs = text                                        // ① 按「空行」切分
//     .split(/\n\s*\n/)                                            //    空行是 Markdown 的自然段落边界
//     .filter(p => p.trim())                                       //    过滤掉纯空白段

//   const chunks = []
//   let buffer = ''


//   for (const p of paragraphs) {          // 逐个段落处理
//     if (p.length > chunkSize) {           // 单段就超长（比如长代码块）
//       if (buffer) {                        // 先把手里攒的封口
//         chunks.push(buffer)
//         buffer = ''
//       }

//       for (let start = 0; start < p.length; start += chunkSize - overlap) {    // 硬切这个长段
//         chunks.push(p.slice(start, start + chunkSize))
//       }
//       continue
//     }

//     if (buffer.length + p.length + 2 > chunkSize) {
//       chunks.push(buffer)
//       buffer = buffer.slice(-overlap) + '\n\n' + p               //留末尾 overlap 字符做重叠，再起新段
//     } else {
//       buffer += (buffer ? '\n\n' : '') + p                       //不超标就继续拼（首段不加分隔符）
//     }
//   }

//   if (buffer) chunks.push(buffer)
//   return chunks
// }






const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters')

// 分隔符优先级：从"大边界"到"小边界"逐级降级
const SEPARATORS = ['\n\n', '\n', '。', '！', '？', '；', '，', ' ', '']

/**
 * 递归切分：优先在段落断开，段落太长就在行断开，行还长就在句子断开……
 * @param {string} text 原始文本
 * @param {number} chunkSize 目标片段长度
 * @param {number} chunkOverlap 重叠长度
 * @returns {Promise<string[]>} 片段数组
 */
async function splitText(text, chunkSize = 600, chunkOverlap = 100) {
  const splitter = new RecursiveCharacterTextSplitter({    // 创建切分器实例
    chunkSize,                                             // 目标大小
    chunkOverlap,                                          // 重叠大小
    separators: SEPARATORS                                 // ★ 中文必须自定义，默认只有英文标点
  })

  return await splitter.splitText(text)                    // ★ 返回 Promise，所以函数声明为 async
}

module.exports = { splitText }