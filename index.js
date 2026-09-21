require('dotenv').config()


const express = require('express')
const config = require('./src/config')
const chatRouter = require('./src/routes/chat')

const app = express()

app.use(express.json())
app.use(express.static('public'))

app.use('/api', chatRouter)

app.listen(config.PORT, () => {
  console.log(`服务已启动 http://localhost:${config.PORT}`)
})