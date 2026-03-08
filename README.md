# EasyClaw

**Quick-use OpenClaw application built on QEMU**  
**基于 QEMU 搭建的 OpenClaw 快捷使用应用程序**

- **系统级隔离** · System-level isolation via QEMU VM
- **一键启动** · One-click start, no tedious installation

Built-in Terminal & Web Console · macOS & Windows

[English](#english) • [中文](#中文)

---



## English

### Overview

EasyClaw is a quick-use application for OpenClaw, built on QEMU. It manages QEMU VMs with OpenClaw pre-installed, providing a GUI for start/stop, an embedded xterm terminal, and a WebView console.

**Key characteristics:**

- **System-level isolation**: OpenClaw runs inside a QEMU VM, fully isolated from the host
- **One-click start**: No tedious installation; launch the app and start OpenClaw instantly

### Features

- **Cross-Platform**: macOS, Windows (x64 / arm64)
- **QEMU Integration**: Auto-detects system QEMU, one-click start/stop
- **Dual View**: Terminal (xterm.js) + OpenClaw Web Console, switchable
- **SSH Tunnel**: Auto port forwarding for local access to VM services
- **Dynamic Config**: Memory, CPU, disk size, SSH port; auto-optimized by host hardware
- **Hardware Check**: Warns if host has less than 2GB RAM or 2 cores
- **System Tray**: Minimize to tray, run in background
- **Ubuntu Cloud Image**: Based on Ubuntu 24.04 (qcow2), out of the box

### Requirements


| Item    | Requirement              |
| ------- | ------------------------ |
| Node.js | 20+                      |
| QEMU    | Installed and in PATH    |
| Host    | Min 2GB RAM, 2 CPU cores |


**Install QEMU**

- **macOS**: `brew install qemu`
- **Windows**: Download from [qemu.org](https://www.qemu.org/download/) and add to PATH

### Quick Start

#### 1. Clone & Install

```bash
git clone <repository-url>
cd easyclaw
npm install
```

#### 2. Prepare VM Image

Place Ubuntu 24.04 cloud image (qcow2) in `resources/`:

```bash
cp /path/to/ubuntu-24.04-minimal-cloudimg-amd64.img resources/
```

> Default credentials: `ubuntu` / `123456` (after cloud-init first boot)

#### 3. Run

```bash
npm run dev
```

The app will auto-start the VM and open the main window.

### Usage

1. **Start**: Click "启动 OpenClaw" and wait for VM boot and SSH tunnel ready
2. **Terminal**: Use the Terminal tab for CLI access
3. **Console**: Switch to Console tab for OpenClaw Web UI
4. **Config**: Click ⚙️ to adjust memory, CPU, disk, SSH port
5. **Minimize**: Click minimize button to hide to system tray
6. **Stop/Quit**: "关闭 OpenClaw" stops VM; "退出" closes app (with exit animation)

**First-time**: After console loads, you'll be prompted to configure models in 【Config】→【Models】→【Model Providers】.

### Project Structure

```
easyclaw/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # Entry, window, IPC, tray
│   │   ├── preload.ts
│   │   ├── qemu.ts        # QEMU management
│   │   └── ssh-tunnel.ts
│   ├── renderer/          # React renderer
│   │   ├── App.tsx
│   │   ├── Terminal.tsx   # xterm terminal
│   │   ├── ConfigPanel.tsx
│   │   └── index.css
│   └── types.ts
├── resources/             # VM image directory
├── build/                 # App icons (icon.icns, icon.ico, easyclaw.png)
├── package.json
└── README.md
```

### Development


| Command                          | Description                 |
| -------------------------------- | --------------------------- |
| `npm run dev`                    | Start dev mode              |
| `npm run build`                  | Build app                   |
| `npm run electron:build`         | Package for current OS      |
| `npm run electron:build:mac`     | Package macOS               |
| `npm run electron:build:win`     | Package Windows (host arch) |
| `npm run electron:build:win-x64` | Package Windows x64         |


### Tech Stack

- **Electron** + **Vite** + **React** + **TypeScript**
- **xterm.js** - Terminal
- **node-pty** - PTY
- **ssh2** - SSH tunnel

### Build Artifacts

- **macOS**: `release/*.zip`
- **Windows**: `release/EasyClaw Setup x.x.x.exe` (installer), `release/EasyClaw x.x.x.exe` (portable)

### Debug

- Main process logs to stdout and `{userData}/easyclaw-debug.log`
- **macOS**: `~/Library/Application Support/easyclaw/`
- **Windows**: `%APPDATA%/easyclaw/`

### Icons

Place in `build/`:

- `icon.icns` (macOS), `icon.ico` (Windows), or `easyclaw.png` (512×512+)

See `build/ICON.md` for details.

---



## 中文

### 简介

EasyClaw 是基于 QEMU 搭建的 OpenClaw 快捷使用应用程序。管理预装 OpenClaw 的 QEMU 虚拟机，提供图形界面启动/关闭、内嵌 xterm 终端和 WebView 控制台。

**核心特征：**

- **系统级隔离**：OpenClaw 运行在 QEMU 虚拟机内，与宿主机完全隔离
- **一键启动**：无需繁琐安装，打开应用即可快速启动 OpenClaw

### 功能特性

- **跨平台**：macOS、Windows（x64 / arm64）
- **QEMU 集成**：自动检测系统 QEMU，一键启动/关闭
- **双视图**：终端（xterm.js）+ OpenClaw Web 控制台，可切换
- **SSH 隧道**：自动端口转发，本地访问 VM 服务
- **动态配置**：内存、CPU、磁盘、SSH 端口；根据宿主机硬件自动优化
- **硬件检测**：宿主机低于 2GB 内存或 2 核 CPU 时弹窗提示
- **系统托盘**：最小化到托盘，后台运行
- **Ubuntu 云镜像**：基于 Ubuntu 24.04（qcow2），开箱即用

### 环境要求


| 项目      | 要求                |
| ------- | ----------------- |
| Node.js | 20+               |
| QEMU    | 已安装并加入 PATH       |
| 宿主机     | 最低 2GB 内存、2 核 CPU |


**安装 QEMU**

- **macOS**：`brew install qemu`
- **Windows**：从 [qemu.org](https://www.qemu.org/download/) 下载安装并配置环境变量

### 快速开始

#### 1. 克隆与安装

```bash
git clone <repository-url>
cd easyclaw
npm install
```

#### 2. 准备虚拟机镜像

将 Ubuntu 24.04 cloud image（qcow2 格式）放入 `resources/`：

```bash
cp /path/to/ubuntu-24.04-minimal-cloudimg-amd64.img resources/
```

> 默认账号：`ubuntu` / `123456`（cloud-init 首次启动后生效）

#### 3. 运行

```bash
npm run dev
```

应用将自动启动 VM 并打开主窗口。

### 使用说明

1. **启动**：点击「启动 OpenClaw」，等待 VM 启动与 SSH 隧道就绪
2. **终端**：在「终端」标签中与虚拟机交互
3. **控制台**：切换到「控制台」标签查看 OpenClaw Web 界面
4. **配置**：点击 ⚙️ 调整内存、CPU、磁盘、SSH 端口
5. **最小化**：点击最小化按钮可将窗口隐藏到系统托盘
6. **关闭/退出**：「关闭 OpenClaw」停止 VM；「退出」关闭应用（含退出动画）

**首次使用**：控制台加载完成后会提示在【配置】→【Models】→【Model Providers】中配置模型。

### 项目结构

```
easyclaw/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── main.ts        # 入口、窗口、IPC、托盘
│   │   ├── preload.ts
│   │   ├── qemu.ts        # QEMU 管理
│   │   └── ssh-tunnel.ts
│   ├── renderer/          # React 渲染进程
│   │   ├── App.tsx
│   │   ├── Terminal.tsx   # xterm 终端
│   │   ├── ConfigPanel.tsx
│   │   └── index.css
│   └── types.ts
├── resources/             # 虚拟机镜像目录
├── build/                 # 应用图标（icon.icns, icon.ico, easyclaw.png）
├── package.json
└── README.md
```

### 开发


| 命令                               | 说明                  |
| -------------------------------- | ------------------- |
| `npm run dev`                    | 启动开发模式              |
| `npm run build`                  | 构建应用                |
| `npm run electron:build`         | 按当前系统打包             |
| `npm run electron:build:mac`     | 打包 macOS            |
| `npm run electron:build:win`     | 打包 Windows（与主机架构一致） |
| `npm run electron:build:win-x64` | 打包 Windows x64      |


### 技术栈

- **Electron** + **Vite** + **React** + **TypeScript**
- **xterm.js** - 终端
- **node-pty** - 伪终端
- **ssh2** - SSH 隧道

### 打包产物

- **macOS**：`release/*.zip`
- **Windows**：`release/EasyClaw Setup x.x.x.exe`（安装版）、`release/EasyClaw x.x.x.exe`（便携版）

### 调试

- 主进程日志输出到终端，同时写入 `{userData}/easyclaw-debug.log`
- **macOS**：`~/Library/Application Support/easyclaw/`
- **Windows**：`%APPDATA%/easyclaw/`

### 图标

将图标放入 `build/`：

- `icon.icns`（macOS）、`icon.ico`（Windows），或 `easyclaw.png`（512×512 及以上）

详见 `build/ICON.md`。

---

## Contributing | 参与贡献

Contributions are welcome! Please feel free to submit Issues and Pull Requests.

欢迎贡献！欢迎提交 Issue 和 Pull Request。

## License | 许可证

MIT License