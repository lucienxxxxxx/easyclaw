declare module 'ssh2' {
  import { Duplex } from 'stream'
  export class Client {
    connect(config: {
      host: string
      port: number
      username: string
      password: string
      readyTimeout?: number
    }): void
    on(event: 'ready', cb: () => void): this
    on(event: 'error', cb: (err: Error) => void): this
    on(event: 'close', cb: () => void): this
    forwardOut(
      srcIP: string,
      srcPort: number,
      dstIP: string,
      dstPort: number,
      cb: (err: Error | undefined, stream: Duplex) => void
    ): void
    end(): void
  }
}
