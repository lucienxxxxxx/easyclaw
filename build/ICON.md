# 应用图标说明

将以下图标文件放入 `build/` 目录，打包时会用作应用图标：

| 平台    | 文件名       | 规格说明                    |
|---------|--------------|-----------------------------|
| macOS   | `icon.icns`  | 推荐 512×512 或 1024×1024   |
| Windows | `icon.ico`   | 至少 256×256，建议多尺寸    |

## 生成方式

1. **从 PNG 转换**：准备一张 512×512 或更大的 PNG 图
2. **macOS (.icns)**：
   - 使用 `iconutil`：`iconutil -c icns icon.iconset`
   - 或在线工具：https://cloudconvert.com/png-to-icns
3. **Windows (.ico)**：
   - 使用 ImageMagick：`magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`
   - 或在线工具：https://cloudconvert.com/png-to-ico

若未放置图标文件，打包时会使用 Electron 默认图标。
