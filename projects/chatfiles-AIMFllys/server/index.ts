import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 3456)

createApp().listen(port, '127.0.0.1', () => {
  console.log(`ChatFiles running at http://127.0.0.1:${port}`)
})
