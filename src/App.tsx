import './App.css'
import { useEffect, useMemo, useState } from 'react'
import { message } from '@tauri-apps/plugin-dialog'
import { exists, rename, stat } from '@tauri-apps/plugin-fs'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { loadLiteratureMapFromPath } from './lib/map'
import type { LiteratureMap, RenameLogEntry, ScanRow } from './lib/types'
import { basename, dirname, joinPath } from './lib/path'
import { pickMapFile, pickPdfFiles, pickPdfFolder, expandPdfPaths, scanPdfs } from './lib/scan'
import { sanitizeFileStem } from './lib/sanitize'
import { getDataRoot, readLastRunEntries, writeRenameLog } from './lib/log'

function App() {
  const [mapPath, setMapPath] = useState<string | null>(null)
  const [map, setMap] = useState<LiteratureMap | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [rows, setRows] = useState<ScanRow[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [conflictEdits, setConflictEdits] = useState<Record<string, string>>({})
  const [showConflicts, setShowConflicts] = useState(false)
  const [isUndoing, setIsUndoing] = useState(false)
  const [dataRoot, setDataRoot] = useState<string | null>(null)
  const [isDropActive, setIsDropActive] = useState(false)

  useEffect(() => {
    getDataRoot()
      .then(setDataRoot)
      .catch(() => {
        // ignore
      })
  }, [])

  const applyMapFromPath = async (p: string) => {
    const loaded = await loadLiteratureMapFromPath(p)
    setMapPath(p)
    setMap(loaded)
    await message(`Loaded ${loaded.size} DOI → title mappings.`)
  }

  const handleDroppedPaths = async (paths: string[]) => {
    const src = Array.isArray(paths)
      ? paths.filter((p): p is string => typeof p === 'string' && p.length > 0)
      : []
    if (src.length === 0) return

    const jsonCandidates = src.filter((p) => p.toLowerCase().endsWith('.json'))
    const pdfCandidates = src.filter((p) => p.toLowerCase().endsWith('.pdf'))
    const otherCandidates = src.filter(
      (p) => !p.toLowerCase().endsWith('.json') && !p.toLowerCase().endsWith('.pdf'),
    )

    if (jsonCandidates.length > 0) {
      if (jsonCandidates.length > 1) {
        await message(
          `You dropped multiple JSON files. Using the first one:\n${jsonCandidates[0]}`,
          { title: 'Map file' },
        )
      }
      try {
        await applyMapFromPath(jsonCandidates[0])
      } catch (err) {
        await message((err as any)?.message || String(err), { title: 'Failed to load map' })
      }
    }

    const folders: string[] = []
    for (const p of otherCandidates) {
      try {
        const info = await stat(p)
        if (info.isDirectory) folders.push(p)
      } catch {
        // ignore non-directories or denied paths
      }
    }

    const toAdd = [...pdfCandidates, ...folders]
    if (toAdd.length > 0) {
      setSelectedPaths((prev) => [...new Set([...prev, ...toAdd])])
    }
  }

  useEffect(() => {
    let unlisten: (() => void) | null = null
    getCurrentWindow()
      .onDragDropEvent(async ({ payload }) => {
        if (payload.type === 'enter' || payload.type === 'over') setIsDropActive(true)
        if (payload.type === 'leave') setIsDropActive(false)
        if (payload.type === 'drop') {
          setIsDropActive(false)
          await handleDroppedPaths(payload.paths)
        }
      })
      .then((fn) => {
        unlisten = fn
      })
      .catch(() => {
        // ignore
      })

    return () => {
      if (unlisten) unlisten()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => {
    const by = {
      matched: 0,
      skipped: 0,
      unmatched: 0,
      conflict: 0,
      error: 0,
    }
    for (const r of rows) by[r.status] += 1
    return by
  }, [rows])

  const conflicts = useMemo(() => rows.filter((r) => r.status === 'conflict'), [rows])

  const canScan = Boolean(map) && selectedPaths.length > 0 && !isScanning && !isApplying
  const canApply = rows.some((r) => r.status === 'matched' || r.status === 'conflict') && !isApplying && !isScanning

  const onPickMap = async () => {
    const p = await pickMapFile()
    if (!p) return
    try {
      await applyMapFromPath(p)
    } catch (err) {
      await message((err as any)?.message || String(err), { title: 'Failed to load map' })
    }
  }

  const onAddPdfs = async () => {
    const files = await pickPdfFiles()
    if (files.length === 0) return
    setSelectedPaths((prev) => [...new Set([...prev, ...files])])
  }

  const onAddFolder = async () => {
    const folder = await pickPdfFolder()
    if (!folder) return
    setSelectedPaths((prev) => [...new Set([...prev, folder])])
  }

  const onClearSelection = () => {
    setSelectedPaths([])
    setRows([])
    setConflictEdits({})
  }

  const onScan = async () => {
    if (!map) return
    setIsScanning(true)
    setRows([])
    setConflictEdits({})
    try {
      const pdfs = await expandPdfPaths(selectedPaths)
      const scanned = await scanPdfs(pdfs, map)
      setRows(scanned)
      const edits: Record<string, string> = {}
      for (const c of scanned.filter((r) => r.status === 'conflict')) {
        if (c.conflictSuggestion) edits[c.path] = c.conflictSuggestion
      }
      setConflictEdits(edits)
    } catch (err) {
      await message((err as any)?.message || String(err), { title: 'Scan failed' })
    } finally {
      setIsScanning(false)
    }
  }

  const applyRenames = async (items: Array<{ from: string; to: string; doi: string | null; title: string | null }>) => {
    const nowIso = new Date().toISOString()
    const log: RenameLogEntry[] = []
    let ok = 0
    let failed = 0

    for (const it of items) {
      try {
        await rename(it.from, it.to)
        log.push({ oldPath: it.from, newPath: it.to, doi: it.doi, title: it.title, timestamp: nowIso })
        ok += 1
      } catch {
        failed += 1
      }
    }

    const logPath = await writeRenameLog(log)
    await message(`Renamed ${ok} files. Failed: ${failed}. Log: ${logPath}`, { title: 'Done' })
  }

  const onApply = async () => {
    if (!canApply) return
    const hasConflicts = conflicts.length > 0
    if (hasConflicts) {
      setShowConflicts(true)
      return
    }

    setIsApplying(true)
    try {
      const items = rows
        .filter((r) => r.status === 'matched' && r.proposedPath)
        .map((r) => ({ from: r.path, to: r.proposedPath as string, doi: r.doi, title: r.title }))
      await applyRenames(items)
      setRows([])
      setSelectedPaths([])
    } catch (err) {
      await message((err as any)?.message || String(err), { title: 'Apply failed' })
    } finally {
      setIsApplying(false)
    }
  }

  const onConfirmConflicts = async () => {
    setShowConflicts(false)
    setIsApplying(true)
    try {
      const items: Array<{ from: string; to: string; doi: string | null; title: string | null }> = []

      for (const r of rows) {
        if (r.status === 'matched' && r.proposedPath) {
          items.push({ from: r.path, to: r.proposedPath, doi: r.doi, title: r.title })
        }
        if (r.status === 'conflict') {
          const chosenName = conflictEdits[r.path]
          if (!chosenName) continue
          const target = joinPath(dirname(r.path), `${sanitizeFileStem(chosenName.replace(/\.pdf$/i, ''))}.pdf`)
          if (await exists(target)) {
            // still conflicting; skip and let the user adjust later
            continue
          }
          items.push({ from: r.path, to: target, doi: r.doi, title: r.title })
        }
      }

      if (items.length === 0) {
        await message('No items selected to rename.', { title: 'Nothing to do' })
        return
      }

      await applyRenames(items)
      setRows([])
      setSelectedPaths([])
    } catch (err) {
      await message((err as any)?.message || String(err), { title: 'Apply failed' })
    } finally {
      setIsApplying(false)
    }
  }

  const onUndo = async () => {
    setIsUndoing(true)
    try {
      const entries = await readLastRunEntries()
      if (entries.length === 0) {
        await message('No previous run log found.', { title: 'Undo' })
        return
      }
      const reversed = [...entries].reverse()
      let ok = 0
      let failed = 0
      for (const e of reversed) {
        try {
          await rename(e.newPath, e.oldPath)
          ok += 1
        } catch {
          failed += 1
        }
      }
      await message(`Undo completed. Restored: ${ok}. Failed: ${failed}.`, { title: 'Undo' })
    } catch (err) {
      await message((err as any)?.message || String(err), { title: 'Undo failed' })
    } finally {
      setIsUndoing(false)
    }
  }

  return (
    <div className="app">
      <div className="header">
        <div>
          <div className="title">ALR Renamer</div>
          <div className="subtitle">
            Rename local PDF files using DOI → title mapping. No proxy downloading; everything stays on your machine.
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={onPickMap} disabled={isScanning || isApplying}>
            Select map JSON
          </button>
          <button className="btn" onClick={onAddPdfs} disabled={isScanning || isApplying}>
            Add PDFs
          </button>
          <button className="btn" onClick={onAddFolder} disabled={isScanning || isApplying}>
            Add folder
          </button>
        </div>
      </div>

      <div className={['card', isDropActive ? 'dropCardActive' : ''].join(' ')}>
        <div className="dropHint">
          <div>
            <div className="dropHintTitle">Drag & drop supported</div>
            <div className="muted">Drop `literature_map.json`, PDFs, or folders anywhere on this window.</div>
          </div>
          <div className="kbd">Drop files</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <span className="pill">
            <span className="pillMuted">Map</span>
            <span className="mono">{mapPath ? basename(mapPath) : 'not selected'}</span>
            <span className="pillMuted">{map ? `${map.size} entries` : ''}</span>
          </span>
          <span className="pill">
            <span className="pillMuted">Data</span>
            <span className="mono">{dataRoot ? basename(dataRoot) : '-'}</span>
          </span>
          <span className="pill">
            <span className="pillMuted">Selection</span>
            <span>{selectedPaths.length} item(s)</span>
          </span>
          <button className="btn" onClick={onClearSelection} disabled={isScanning || isApplying}>
            Clear
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btnPrimary" onClick={onScan} disabled={!canScan}>
            {isScanning ? 'Scanning…' : 'Scan'}
          </button>
          <button className="btn btnPrimary" onClick={onApply} disabled={!canApply}>
            {isApplying ? 'Applying…' : conflicts.length ? 'Resolve conflicts…' : 'Apply rename'}
          </button>
          <button className="btn" onClick={onUndo} disabled={isUndoing || isScanning || isApplying}>
            {isUndoing ? 'Undoing…' : 'Undo last run'}
          </button>
        </div>

        <div className="split">
          <div className="row">
            <span className="pill">Matched: {stats.matched}</span>
            <span className="pill">Skipped: {stats.skipped}</span>
            <span className="pill">Unmatched: {stats.unmatched}</span>
            <span className="pill">Conflicts: {stats.conflict}</span>
            <span className="pill">Errors: {stats.error}</span>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>File</th>
                  <th>DOI</th>
                  <th>Title</th>
                  <th>Proposed</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No scan results yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span
                          className={[
                            'status',
                            r.status === 'matched' ? 'stMatched' : '',
                            r.status === 'skipped' ? 'stSkipped' : '',
                            r.status === 'unmatched' ? 'stUnmatched' : '',
                            r.status === 'conflict' ? 'stConflict' : '',
                            r.status === 'error' ? 'stError' : '',
                          ].join(' ')}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="mono">{r.fileName}</td>
                      <td className="mono">{r.doi || ''}</td>
                      <td title={r.title || ''}>{r.title || ''}</td>
                      <td className="mono">
                        {r.status === 'conflict'
                          ? conflictEdits[r.path] || r.conflictSuggestion || ''
                          : r.proposedName || ''}
                      </td>
                      <td className="muted">{r.reason || ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showConflicts && (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="row" style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>Resolve conflicts ({conflicts.length})</div>
              <div style={{ flex: 1 }} />
              <button className="btn" onClick={() => setShowConflicts(false)}>
                Cancel
              </button>
              <button className="btn btnPrimary" onClick={onConfirmConflicts} disabled={isApplying}>
                Apply rename
              </button>
            </div>
            <div className="muted" style={{ marginBottom: 10 }}>
              Target file already exists. Tool suggests <span className="mono">title - doiSuffix(.pdf)</span> and then
              increments <span className="mono">(2)</span>, <span className="mono">(3)</span>… as needed.
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>DOI</th>
                    <th>Suggested new name</th>
                  </tr>
                </thead>
                <tbody>
                  {conflicts.map((c) => (
                    <tr key={c.path}>
                      <td className="mono">{c.fileName}</td>
                      <td className="mono">{c.doi || ''}</td>
                      <td>
                        <input
                          className="input mono"
                          value={conflictEdits[c.path] || ''}
                          onChange={(e) =>
                            setConflictEdits((prev) => ({ ...prev, [c.path]: e.target.value }))
                          }
                          placeholder={c.conflictSuggestion || ''}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
