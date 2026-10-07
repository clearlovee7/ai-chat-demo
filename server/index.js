require('dotenv').config()


const express = require('express')
const config = require('./src/config')
const chatRouter = require('./src/routes/chat')
const ingestRouter = require('./src/routes/ingest')

const app = express()

app.use(express.json({ limit: '5mb' }))                 // ★ 默认只有 100kb，大文档会 413

app.use('/api', chatRouter)
app.use('/api', ingestRouter) 

app.listen(config.PORT, () => {
  console.log(`服务已启动 http://localhost:${config.PORT}`)
})