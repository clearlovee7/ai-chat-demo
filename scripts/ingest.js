require('dotenv').config()

const fs = require('fs')
const path = require('path')
const { splitText } = require('../src/rag/chunk')
const { getEmbeddings } = require('../src/services/embedding')
const { saveStore } = require('../src/rag/store')

async function main() {
  const file = process.argv[2] || path.join(__dirname, '../README.md')  // 从命令行取文件，默认用 README
  const text = fs.readFileSync(file, 'utf-8')   // 读成字符串（utf-8 保证中文不乱码）
  console.log(`读入 ${file}，共 ${text.length} 字`)

  const chunks = splitText(text, 600, 100)   // 切成 400 字一片、重叠 80
  console.log(`切成 ${chunks.length} 个片段`)

  const vectors = []   // 装所有向量
  const BATCH = 16    // 每批 16 条（接口有单次上限）

  for (let i = 0; i <= chunks.length; i += BATCH) {    // 分批循环
    const batch = chunks.slice(i, i + BATCH)          // 取出这一批
    const result = await getEmbeddings(batch)

    vectors.push(...result)

    console.log(`  进度 ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`)
  }

  const items = chunks.map((text, i) => ({    // 把片段和向量配对
    text,
    vector: vectors[i]
  }))

  saveStore(items)     // 写入 data/store.json

  console.log(`建库完成，共 ${items.length} 条 → data/store.json`)
}

main().catch(e => {
  console.log('失败:', e.message)
  process.exit(1)   // 非 0 退出码，方便脚本判断成败
})