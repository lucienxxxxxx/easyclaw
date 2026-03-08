#!/usr/bin/env node
/**
 * 等待端口可连接，不依赖 wait-on 的复杂依赖
 */
const net = require('net')
const port = parseInt(process.argv[2] || '5173', 10)
const maxAttempts = 60
const interval = 500

function check() {
  return new Promise((resolve) => {
    const sock = net.createConnection(port, '127.0.0.1', () => {
      sock.destroy()
      resolve(true)
    })
    sock.on('error', () => resolve(false))
    sock.setTimeout(1000, () => {
      sock.destroy()
      resolve(false)
    })
  })
}

async function wait() {
  for (let i = 0; i < maxAttempts; i++) {
    if (await check()) {
      console.log(`[wait-port] localhost:${port} 已就绪`)
      process.exit(0)
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  console.error(`[wait-port] 超时: localhost:${port} 在 ${maxAttempts * interval / 1000}s 内未就绪`)
  process.exit(1)
}

wait()
