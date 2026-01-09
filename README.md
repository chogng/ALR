# Renamer

状态：Completed / Archived  
最后更新：2026-01-09

（CI/Release 流程测试：v0.2.1）

Renamer 是一个轻量桌面工具，用于基于 `DOI -> Title` 映射批量重命名 PDF 文件。  
技术栈：Tauri 2 + React + TypeScript + Vite。

## 功能

- 扫描 PDF：提取/识别 DOI（文件名 + PDF 内容）
- 使用 `literature_map.json`（可选）将 DOI 映射为论文标题
- 可选：通过 CrossRef API 补全元数据（标题/期刊/年份/作者等）
- 重命名 + Undo（撤销上次重命名）
- 冲突处理（目标文件已存在时给出建议）

## 使用（简版）

1. Add → Add map JSON（可选）：选择 `literature_map.json`
2. Add → Add PDFs / Add folder
3. Scan 预览结果
4. Rename 执行重命名
5. Undo 回退上一次重命名

## `literature_map.json` 格式

支持两种输入：
- 顶层数组：`[{ "doi": "...", "title": "..." }]`
- 包含 `items`：`{ "items": [{ "doi": "...", "title": "..." }] }`

详见：`LITERATURE_MAP_JSON_SPEC.md`

## 开发与构建

- 开发运行（Tauri）：`npm run dev:tauri`
- 前端构建：`npm run build`
- 打包安装程序（Windows）：`npm run build:tauri`

打包产物固定在（不再导出到其他目录）：
- NSIS：`src-tauri/target/release/bundle/nsis/Renamer-setup.exe`
- MSI：`src-tauri/target/release/bundle/msi/Renamer.msi`

## 安装 / 卸载（Windows, NSIS）

- 安装前：如果系统存在“孤儿卸载项”（卸载项在但 `uninstall.exe` 已丢失），安装器会自动清理它，避免阻塞升级安装。
- 卸载后：会执行“干净卸载”，删除应用数据/缓存/日志目录（包含 WebView 数据）。

应用数据目录（安装版）位于系统应用数据路径下，目录名与 `productName` 绑定：
- `%APPDATA%\\Renamer Data`
- `%LOCALAPPDATA%\\Renamer Data`

## 已知实现细节（便于维护）

### 兼容性（旧 WebView2）

部分旧版 WebView2 / Chromium 不支持 `Promise.withResolvers`，而 `pdfjs-dist` 可能会使用它。
项目在入口添加了 polyfill：
- `src/polyfills.ts`
- `src/main.tsx`

### 性能（启动更快）

`pdfjs-dist` 采用按需动态加载：只有扫描/解析 PDF 时才会加载 pdf 相关 chunk，避免首屏把 PDF 解析库打进主包导致启动变慢。
实现位置：`src/lib/pdf.ts`。

### 启动渲染计时（可选调试）

在 DevTools Console 执行：`localStorage.setItem('debug_startup','1')` 并重启应用，会打印 `startup:render` 耗时。
关闭：`localStorage.removeItem('debug_startup')`。

### 窗口与布局体验

- 小窗口空列表不再强制出现横/纵滚动条：移除强制 `min-height` / 表格 `min-width` 等约束（`src/components/Layout.css`、`src/components/MainContent.css`）。
- 快速 resize 时的黑边：统一设置 window/webview 背景色与页面背景色为 `#f8f9fa`（`src-tauri/tauri.conf.json`、`src/index.css`）。
- 启动位置稳定：窗口配置 `center: true`（`src-tauri/tauri.conf.json`）。

## GitHub Actions（CI / Release）

- CI（每次 push/PR）：自动执行 `npm run lint` + `npm run build`，结果在 GitHub 仓库的 Actions 页面查看。
- Release（仅打 tag）：推送 `v*` 标签后，在 Windows runner 上打包 NSIS 安装包并发布到 GitHub Releases。
