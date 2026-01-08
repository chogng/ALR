# ALR Renamer

**ALR Renamer** 是一个轻量级桌面工具，用于根据 `DOI → Title` 映射批量重命名本地 PDF 文件。

基于 **Tauri 2 + React + TypeScript + Vite** 构建。

## ✨ 功能特性

- 📂 **批量重命名** - 根据 DOI 映射将 PDF 重命名为论文标题
- 🔍 **自动识别 DOI** - 从 PDF 文件名中提取 DOI 进行匹配
- ⚠️ **冲突处理** - 智能处理文件名冲突，提供建议方案
- ↩️ **撤销支持** - 可一键撤销上次重命名操作
- 📁 **拖放支持** - 支持拖放 JSON 映射文件、PDF 文件或文件夹
- 💾 **便携模式** - 支持打包为免安装便携版

## 🚀 快速开始

### 环境要求

- Node.js 18+
- Rust 1.70+
- Windows 10/11（需要 WebView2 Runtime）

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev:tauri
```

### 构建应用

```bash
# 完整安装包
npm run build:tauri

# 便携版（Windows）
npm run package:portable:win
```

## 📖 使用说明

1. **加载映射文件** - 点击「Select map JSON」选择 `literature_map.json` 文件
2. **添加 PDF** - 点击「Add PDFs」或「Add folder」，或直接拖放文件/文件夹
3. **扫描预览** - 点击「Scan」预览重命名结果
4. **应用重命名** - 点击「Apply rename」执行重命名
5. **撤销操作** - 如需回退，点击「Undo last run」

## 📋 映射文件格式

`literature_map.json` 格式示例：

```json
{
  "version": 1,
  "generatedAt": "2026-01-07T00:00:00.000Z",
  "items": [
    {
      "doi": "10.1038/s41586-024-12345-6",
      "title": "Paper title here"
    }
  ]
}
```

详细规范请参阅 [LITERATURE_MAP_JSON_SPEC.md](LITERATURE_MAP_JSON_SPEC.md)。

## 📁 项目结构

```
ALR/
├── src/                    # React 前端源码
│   ├── App.tsx             # 主应用组件
│   └── lib/                # 工具库
│       ├── doi.ts          # DOI 解析
│       ├── map.ts          # 映射文件加载
│       ├── pdf.ts          # PDF 处理
│       ├── scan.ts         # 扫描逻辑
│       └── ...
├── src-tauri/              # Tauri 后端（Rust）
│   ├── src/
│   │   ├── main.rs
│   │   └── lib.rs
│   └── tauri.conf.json     # Tauri 配置
├── scripts/
│   └── package-portable.ps1  # 便携版打包脚本
└── public/                 # 静态资源
```

## 📜 许可证

MIT License
