const { splitText } = require('../rag/chunk');
const { getEmbeddings } = require('../services/embedding');
const { saveStore, loadStore } = require('../rag/store');

const BATCH = 16
const CHUNK_SIZE = 300
const OVERLAP = 100

/**
 * 收文档文本 → 切片 → 向量化 → 入库
 * body: { filename, content, mode: 'append' | 'replace' }
 */

async function ingest(req, res) {
  const { filename = '未命名文档', content, mode = 'append' } = req.body

  if (!content || !content.trim()) {
    return res.status(400).json({ error: '文件内容为空' })
  }

  try {
    const chunks = await splitText(content, CHUNK_SIZE, OVERLAP)
    console.log(`共切分为 ${chunks.length} 个片段`)

    const vectors = []

    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH)          // 取出这一批
      const result = await getEmbeddings(batch)

      vectors.push(...result)

      console.log(`  进度 ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`)
    }

    const items = chunks.map((text, i) => ({    // 把片段和向量配对
      text,
      vector: vectors[i]
    }))

    const existing = mode === 'replace' ? [] : loadStore()

    const merged = [...existing, ...items]
    saveStore(merged)

    console.log(`入库完成，共 ${merged.length} 条数据`)

    res.json({
      ok: true,
      filename,
      chunks: items.length,
      total: merged.length
    })

  } catch (e) {
    console.error('入库失败:', e.message)
    res.status(500).json({ error: '入库失败：' + e.message })
  }
}

module.exports = {
  ingest
}