# ALR Renamer：`literature_map.json` 导出格式规范（v1）

## 目的
提供 **DOI → Title** 映射，用于本地批量重命名 PDF：默认命名为 `title.pdf`（冲突时自动建议 `title - doiSuffix (n).pdf`）。

## 文件结构（推荐）
导出为一个 JSON 对象：

```json
{
  "version": 1,
  "generatedAt": "2026-01-07T00:00:00.000Z",
  "items": [
    {
      "doi": "10.1038/s41586-024-12345-6",
      "title": "Paper title here",
      "source": "nature",
      "articleUrl": "https://www.nature.com/articles/s41586-024-12345-6",
      "publishedDate": "2024-12-31"
    }
  ]
}
```

## 必须字段（Required）
- 顶层：
  - `items`: array
- `items[]` 每条：
  - `doi`: string（必须）
  - `title`: string（必须）

## 可选字段（Optional）
- 顶层：
  - `version`: number（建议固定为 `1`）
  - `generatedAt`: string（ISO 8601 时间戳）
- `items[]` 每条（仅用于排错/展示，不影响重命名逻辑）：
  - `source`: string（例如 `nature` / `science`）
  - `articleUrl`: string（文章落地页 URL）
  - `publishedDate`: string（建议 `YYYY-MM-DD`）

## DOI 规范要求
- `doi` 必须是字符串。
- 推荐导出为 **纯 DOI**：`10.xxxx/xxxxx`
- 工具兼容以下形式（但不推荐导出时使用）：
  - `doi:10.xxxx/xxxxx`
  - `https://doi.org/10.xxxx/xxxxx`
- 建议：不要带末尾标点（如 `.`、`)`、`,`）。

## 去重/一致性建议
- 同一个 DOI 可能出现多次时：建议导出端先去重（保留最早/最新一条均可），或保证同 DOI 的 `title` 一致。
- `title` 建议保留原始标题，不要提前做文件名清洗（工具会自行清洗非法字符）。

## 兼容格式（可选，非推荐）
工具也兼容“顶层数组”格式（你们现有 API 直接返回的那种）：

```json
[
  { "doi": "10.1038/...", "title": "..." }
]
```

