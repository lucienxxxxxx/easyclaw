# Resources

## 1. Ubuntu 镜像

将 Ubuntu 24.04 cloud 镜像 (qcow2) 放入此目录：

```
ubuntu-24.04-minimal-cloudimg-amd64-compressed.img
```

**下载**: [Ubuntu Cloud Images](https://cloud-images.ubuntu.com/minimal/releases/jammy/release/)

默认凭证: `ubuntu` / `123456`

## 2. QEMU（内置打包）

构建安装包前运行 `npm run download-qemu`，将自动下载/准备 QEMU：

- **Windows**: 从 [qemu-portable](https://github.com/dirkarnez/qemu-portable) 下载便携版到 `qemu/win32-x64/`
- **macOS**: 从 Homebrew 复制（需已安装 `brew install qemu`）到 `qemu/darwin-arm64/` 或 `qemu/darwin-x64/`

`electron:build` 系列命令会自动执行 `download-qemu`。
