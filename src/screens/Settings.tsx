import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteWall } from '../hooks/useWalls';
import { formatBytes, useStorageBreakdown } from '../hooks/useStorage';
import {
  applyImportPayload,
  buildExportPayload,
  parseExportPayload,
  serializeExportPayload,
  type ConflictStrategy,
  type ImportResult,
} from '../lib/exportImport';

export default function Settings() {
  const [refreshKey, setRefreshKey] = useState(0);
  const breakdown = useStorageBreakdown(refreshKey);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  async function handleExport() {
    setBusy('Exporting…');
    setError(null);
    try {
      const payload = await buildExportPayload();
      const json = serializeExportPayload(payload);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spray-wall-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${payload.walls.length} wall${payload.walls.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function handleImportFileChosen(file: File | null) {
    if (!file) return;
    setPendingImportFile(file);
  }

  async function runImport(strategy: ConflictStrategy) {
    const file = pendingImportFile;
    if (!file) return;
    setPendingImportFile(null);
    setBusy('Importing…');
    setError(null);
    try {
      const text = await file.text();
      const payload = parseExportPayload(text);
      const result: ImportResult = await applyImportPayload(payload, strategy);
      setMessage(
        `Imported ${result.importedWalls} wall${result.importedWalls === 1 ? '' : 's'} and ` +
          `${result.importedRoutes} route${result.importedRoutes === 1 ? '' : 's'}` +
          (result.skippedWalls || result.skippedRoutes
            ? ` (skipped ${result.skippedWalls} wall${result.skippedWalls === 1 ? '' : 's'}, ` +
              `${result.skippedRoutes} route${result.skippedRoutes === 1 ? '' : 's'} already present)`
            : '.'),
      );
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteWall(wallId: string, wallName: string) {
    if (!confirm(`Delete "${wallName}" and all its routes? This can't be undone.`)) return;
    await deleteWall(wallId);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-neutral-400">
          ← Back
        </Link>
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Storage</h2>
        {!breakdown && <p className="text-sm text-neutral-400">Loading…</p>}
        {breakdown && breakdown.perWall.length === 0 && (
          <p className="text-sm text-neutral-400">No walls yet.</p>
        )}
        {breakdown && breakdown.perWall.length > 0 && (
          <>
            <p className="text-sm text-neutral-400">Total: {formatBytes(breakdown.totalBytes)}</p>
            <ul className="flex flex-col gap-1.5">
              {breakdown.perWall.map((w) => (
                <li
                  key={w.wallId}
                  className="flex items-center justify-between rounded-lg bg-neutral-800 px-3 py-2 text-sm"
                >
                  <span className="truncate">{w.wallName}</span>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-neutral-400">{formatBytes(w.bytes)}</span>
                    <button
                      className="text-red-400"
                      onClick={() => void handleDeleteWall(w.wallId, w.wallName)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Backup</h2>
        <p className="text-sm text-neutral-400">
          Export all walls and routes to a single file, or import one to restore or merge.
        </p>
        <div className="flex gap-3">
          <button
            className="flex-1 rounded-full bg-neutral-800 px-4 py-3 text-sm font-medium disabled:opacity-50"
            disabled={!!busy}
            onClick={() => void handleExport()}
          >
            Export
          </button>
          <button
            className="flex-1 rounded-full bg-neutral-800 px-4 py-3 text-sm font-medium disabled:opacity-50"
            disabled={!!busy}
            onClick={() => fileInputRef.current?.click()}
          >
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => handleImportFileChosen(e.target.files?.[0] ?? null)}
          />
        </div>
      </section>

      {pendingImportFile && (
        <div className="flex flex-col gap-2 rounded-lg bg-blue-900/40 px-3 py-3 text-sm text-blue-100">
          <p>
            Import "{pendingImportFile.name}"? If any walls or routes already exist locally
            (matched by id), choose how to handle them.
          </p>
          <div className="flex gap-2">
            <button
              className="flex-1 rounded-full bg-neutral-800 px-3 py-2 font-medium text-neutral-50"
              onClick={() => void runImport('skip')}
            >
              Keep existing (skip duplicates)
            </button>
            <button
              className="flex-1 rounded-full bg-neutral-800 px-3 py-2 font-medium text-neutral-50"
              onClick={() => void runImport('overwrite')}
            >
              Overwrite with imported
            </button>
          </div>
          <button className="self-start underline" onClick={() => setPendingImportFile(null)}>
            Cancel
          </button>
        </div>
      )}

      {busy && <p className="text-sm text-neutral-400">{busy}</p>}
      {message && <p className="rounded-lg bg-green-900/40 px-3 py-2 text-sm text-green-200">{message}</p>}
      {error && <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-200">{error}</p>}
    </div>
  );
}
