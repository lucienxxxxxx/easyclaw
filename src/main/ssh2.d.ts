declare module 'ssh2' {
  import { Duplex } from 'stream'
  export interface ClientChannel extends Duplex {
    stderr?: NodeJS.ReadableStream
  }
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
    shell(
      opts: { cols?: number; rows?: number } | false,
      cb: (err: Error | undefined, stream: ClientChannel) => void
    ): this
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
