const express = require('express');
const router = express.Router()
const { ingest } = require('../controllers/ingest')
const { loadStore } = require('../rag/store')

router.post('/ingest', ingest)

// 查库状态（前端显示片段数）
router.get('/store', (req, res) => {
  res.json({ total: loadStore().length })
})

module.exports = router