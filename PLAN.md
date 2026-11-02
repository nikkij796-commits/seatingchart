# Seating app plan

Stack: Vite + React + TypeScript, Zustand + Immer (state, undo/redo via project snapshots with structural sharing),
IndexedDB via `idb` (local-first, behind a `ProjectRepo` interface so cloud sync can be added later),
PapaParse + SheetJS (CSV/XLSX), pdf.js (PDF backgrounds), jsPDF (exports), Vitest (logic) + Playwright (e2e).
Why: static site, no server, fits ~500 guests with plain lists. Immer snapshots make undo/redo trivial and keep every
mutation a pure function of the project.

Decisions (from the owner): local-only storage, single editor, static hosting, <=500 guests. Milestone 6 (accounts/sync/share
links) is deferred; `ProjectRepo` + JSON export/import are the seam for it.

Privacy: no real guest data in the repo. Sample data is generated and fictional.

Milestones 1-5 implemented; see README for status.
