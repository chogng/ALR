# Renamer

本项目已完结。

- 状态：✅ Completed / Archived
- 最后更新：2026-01-09

## 简介

Renamer 是一个轻量级桌面工具，用于基于 `DOI -> Title` 映射批量重命名本地 PDF 文件。  
技术栈：Tauri 2 + React + TypeScript + Vite。

## 功能

- 扫描 PDF，提取/识别 DOI
- 使用 `literature_map.json`（可选）将 DOI 映射为论文标题
- 可选：通过 CrossRef API 补全元数据（标题/期刊/年份/作者等）
- 重命名 + Undo（撤销上次重命名）
- 冲突处理（目标文件名存在时给出建议）

## 使用说明（简版）

1. Add → Add map JSON（可选）选择 `literature_map.json`
2. Add → Add PDFs / Add folder
3. 点击 Scan 预览结果
4. 点击 Rename 执行重命名
5. 如需回退，点击 Undo

## `literature_map.json` 格式

支持两种输入：

- 顶层数组：`[{ "doi": "...", "title": "..." }]`
- 包含 items：`{ "items": [{ "doi": "...", "title": "..." }] }`

详细规范见 `LITERATURE_MAP_JSON_SPEC.md`。
