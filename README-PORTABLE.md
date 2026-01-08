# ALR Renamer (Portable)

This is a **portable (no installer)** build of ALR Renamer. It renames local PDF files using a `DOI -> title` mapping, entirely on your machine.

## Requirements (Windows)

- Windows 10/11
- Microsoft Edge **WebView2 Runtime** (most machines already have it; if the app fails to start, install WebView2 Runtime and try again)

## How to get `literature_map.json`

No code changes needed in Appointer:

1. Open the Literature Research page and run a search.
2. Open DevTools → Network, find the request `POST /api/literature/search`.
3. Copy the **Response** JSON and save it as `literature_map.json`.

The tool accepts either:
- A top-level array: `[{ "doi": "...", "title": "...", ... }]` (recommended), or
- An object with `items`: `{ "items": [ ... ] }`

## How to use

1. Run `ALR Renamer.exe`.
2. Click **Select map JSON** → choose your `literature_map.json`.
3. Click **Add PDFs** or **Add folder**.
4. Click **Scan** to preview changes.
5. Click **Apply rename** (conflicts will prompt a dialog).
6. If needed, click **Undo last run** to revert using the last run log.

## Notes

- Renaming is **in-place** (original folder).
- The app runs in **portable/green mode**: it creates an `ALR Renamer Data/` folder next to the `.exe` to store its own data (last-run log + webview cache).
- Default target name is `title.pdf`.
- If `title.pdf` already exists, it suggests `title - doiSuffix.pdf`, then `title - doiSuffix (2).pdf`, etc.
