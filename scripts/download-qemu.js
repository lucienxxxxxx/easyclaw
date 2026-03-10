#!/usr/bin/env node
/**
 * 下载/准备 QEMU 二进制到 resources/qemu/{platform}/
 * - Windows: 从 dirkarnez/qemu-portable 下载便携版
 * - macOS: 从 Homebrew 复制（需已安装 brew install qemu）
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const https = require('https')

// 支持通过环境变量指定输出目录（打包应用内调用时）
const ROOT = path.join(__dirname, '..')
const QEMU_DIR = process.env.QEMU_OUTPUT_DIR || path.join(ROOT, 'resources', 'qemu')

const QEMU_PORTABLE_URL = 'https://github.com/dirkarnez/qemu-portable/releases/download/20240822/qemu-w64-portable-20240822.zip'

function mkdirp(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function download(url) {
  return new Promise((resolve, reject) => {
    const file = path.join(require('os').tmpdir(), 'qemu-portable.zip')
    const stream = fs.createWriteStream(file)
    https.get(url, { headers: { 'User-Agent': 'curl/7.64' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return download(res.headers.location).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      res.pipe(stream)
      stream.on('finish', () => {
        stream.close()
        resolve(file)
      })
    }).on('error', reject)
  })
}

function unzip(file, dest) {
  mkdirp(dest)
  // Node 无内置 unzip，使用系统命令
  const platform = process.platform
  if (platform === 'win32') {
    execSync(`powershell -Command "Expand-Archive -Path '${file.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force"`, { stdio: 'inherit' })
  } else {
    execSync(`unzip -o "${file}" -d "${dest}"`, { stdio: 'inherit' })
  }
}

async function downloadWindows() {
  const dest = path.join(QEMU_DIR, 'win32-x64')
  const exe = path.join(dest, 'qemu-system-x86_64.exe')
  if (fs.existsSync(exe)) {
    console.log('[download-qemu] Windows QEMU 已存在，跳过')
    return
  }
  console.log('[download-qemu] 下载 Windows QEMU 便携版...')
  const zipPath = await download(QEMU_PORTABLE_URL)
  const extractDir = path.join(path.dirname(zipPath), 'qemu-extract')
  unzip(zipPath, extractDir)
  const walk = (dir) => {
    const items = fs.readdirSync(dir, { withFileTypes: true })
    for (const item of items) {
      const full = path.join(dir, item.name)
      if (item.name === 'qemu-system-x86_64.exe') return path.dirname(full)
      if (item.isDirectory()) {
        const r = walk(full)
        if (r) return r
      }
    }
    return null
  }
  const found = walk(extractDir)
  if (!found) {
    throw new Error('解压后未找到 qemu-system-x86_64.exe')
  }
  mkdirp(dest)
  const copyAll = (srcDir, dstDir) => {
    for (const name of fs.readdirSync(srcDir)) {
      const src = path.join(srcDir, name)
      const dst = path.join(dstDir, name)
      if (fs.statSync(src).isDirectory()) {
        mkdirp(dst)
        copyAll(src, dst)
      } else {
        fs.copyFileSync(src, dst)
      }
    }
  }
  copyAll(found, dest)
  fs.rmSync(extractDir, { recursive: true, force: true })
  fs.unlinkSync(zipPath)
  console.log('[download-qemu] Windows QEMU 已就绪:', dest)
}

function copyFromHomebrew() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const dest = path.join(QEMU_DIR, `darwin-${arch}`)
  const exe = path.join(dest, 'qemu-system-x86_64')
  if (fs.existsSync(exe)) {
    console.log('[download-qemu] macOS QEMU 已存在，跳过')
    return
  }
  let prefix
  try {
    prefix = execSync('brew --prefix qemu', { encoding: 'utf8' }).trim()
  } catch {
    throw new Error('未找到 Homebrew QEMU，请先运行: brew install qemu')
  }
  if (!fs.existsSync(prefix)) {
    throw new Error(`Homebrew QEMU 路径不存在: ${prefix}`)
  }
  mkdirp(dest)
  // brew --prefix qemu 指向 Cellar/qemu/x.x.x，需复制整棵目录（含 lib 等依赖）
  execSync(`cp -R "${path.join(prefix, 'bin')}" "${dest}/"`, { stdio: 'inherit' })
  const libSrc = path.join(prefix, 'lib')
  if (fs.existsSync(libSrc)) {
    execSync(`cp -R "${libSrc}" "${dest}/"`, { stdio: 'inherit' })
  }
  const shareSrc = path.join(prefix, 'share')
  if (fs.existsSync(shareSrc)) {
    execSync(`mkdir -p "${path.join(dest, 'share')}" && cp -R "${path.join(prefix, 'share', 'qemu')}" "${path.join(dest, 'share')}/"`, { stdio: 'inherit' })
  }
  console.log('[download-qemu] macOS QEMU 已就绪:', dest)
}

function main() {
  mkdirp(QEMU_DIR)
  const platform = process.platform
  if (platform === 'win32') {
    return downloadWindows()
  }
  if (platform === 'darwin') {
    return copyFromHomebrew()
  }
  console.log('[download-qemu] 当前平台', platform, '暂不支持自动下载 QEMU')
}

main().catch((err) => {
  console.error('[download-qemu] 失败:', err.message)
  process.exit(1)
})
