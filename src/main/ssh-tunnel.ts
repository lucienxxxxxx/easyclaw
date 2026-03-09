import * as net from 'net'
import { Client } from 'ssh2'

/** SSH 隧道：宿主机 localPort -> 虚拟机 dstHost:dstPort */
export class SshTunnel {
  private server: net.Server | null = null
  private client: Client | null = null
  private sshPort: number
  private localPort: number
  private dstHost: string
  private dstPort: number
  private username: string
  private password: string
  private onReady?: () => void
  private onError?: (err: Error) => void

  private isExpectedSocketError(err: unknown): boolean {
    const e = err as NodeJS.ErrnoException | undefined
    const code = e?.code
    return code === 'ECONNRESET' || code === 'EPIPE' || code === 'ECONNABORTED'
  }

  constructor(opts: {
    sshPort: number
    localPort: number
    dstHost: string
    dstPort: number
    username: string
    password: string
    onReady?: () => void
    onError?: (err: Error) => void
  }) {
    this.sshPort = opts.sshPort
    this.localPort = opts.localPort
    this.dstHost = opts.dstHost
    this.dstPort = opts.dstPort
    this.username = opts.username
    this.password = opts.password
    this.onReady = opts.onReady
    this.onError = opts.onError
  }

  async start(): Promise<void> {
    if (this.server) {
      console.log('[SshTunnel] 已在运行')
      return
    }

    const ssh = new Client()
    this.client = ssh

    return new Promise((resolve, reject) => {
      ssh.on('ready', () => {
        console.log('[SshTunnel] SSH 已连接')
        const server = net.createServer((socket) => {
          const srcAddr = socket.remoteAddress || '127.0.0.1'
          const srcPort = socket.remotePort || 0
          socket.on('error', (err) => {
            if (!this.isExpectedSocketError(err)) {
              console.warn('[SshTunnel] local socket 错误:', err)
            }
          })
          ssh.forwardOut(srcAddr, srcPort, this.dstHost, this.dstPort, (err, stream) => {
            if (err) {
              console.error('[SshTunnel] forwardOut 错误:', err)
              socket.destroy()
              return
            }
            stream.on('error', (streamErr) => {
              if (!this.isExpectedSocketError(streamErr)) {
                console.warn('[SshTunnel] SSH stream 错误:', streamErr)
              }
              socket.destroy()
            })
            socket.pipe(stream).pipe(socket)
            stream.on('close', () => socket.destroy())
            socket.on('close', () => stream.destroy())
          })
        })

        server.listen(this.localPort, '127.0.0.1', () => {
          this.server = server
          console.log(`[SshTunnel] 监听 127.0.0.1:${this.localPort} -> ${this.dstHost}:${this.dstPort}`)
          this.onReady?.()
          resolve()
        })

        server.on('error', (err) => {
          console.error('[SshTunnel] 服务端错误:', err)
          this.onError?.(err)
        })
      })

      ssh.on('error', (err: Error) => {
        console.error('[SshTunnel] SSH 错误:', err)
        this.onError?.(err)
        reject(err)
      })

      ssh.on('close', () => {
        this.stop()
      })

      ssh.connect({
        host: '127.0.0.1',
        port: this.sshPort,
        username: this.username,
        password: this.password,
        readyTimeout: 30000,
      })
    })
  }

  stop(): void {
    if (this.server) {
      this.server.close()
      this.server = null
    }
    if (this.client) {
      this.client.end()
      this.client = null
    }
    console.log('[SshTunnel] 已停止')
  }

  isRunning(): boolean {
    return this.server !== null
  }
}
