//命令行调试工具
require('dotenv').config()

const { search } = require('../src/rag/store')

async function main() {
  const query = process.argv.slice(2).join(' ')

  if (!query) {
    console.log('用法: node scripts/search.js "你的问题"')
    process.exit(1)
  }

  const results = await search(query, 3)

  console.log(`\n 问题：${query}\n`)

  results.forEach((r, i) => {       // 逐条输出
    console.log(`${i + 1}. 相似度 ${r.score.toFixed(4)}`)
    console.log(r.text.slice(0, 180).replace(/\n/g, ' '))      // 只打印前 180 字，换行压成空格便于阅读
    console.log('')                                            // 空行分隔
  })

}

main().catch(e => {
  console.log('失败:', e.message)
  process.exit(1)
})