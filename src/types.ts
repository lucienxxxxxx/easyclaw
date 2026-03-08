export interface VMConfig {
  memory: number
  cpus: number
  diskSize: number
  diskPath?: string
  autoLoginDelay?: number // 秒，0=禁用自动登录，默认12
  sshPort?: number // 主机 SSH 端口，转发到虚拟机 22，默认 2222
}
