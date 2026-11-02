# Seating Chart

A local-first event seating app: create events, import a guest list (CSV/XLSX), define or upload any room layout,
and seat guests by table with drag and drop. Everything is stored in your browser (IndexedDB) and autosaved.

```
npm install
npm run dev        # development
npm run build      # type-check + production build (static site in dist/)
npm test           # unit tests (Vitest)
npm run e2e        # Playwright, desktop + phone projects
```

## What is built (milestones 1-5)
- **Data model** with stable ids everywhere: guests, parties, groups, layouts (slots + fixed shapes), events with their own plan.
- **Import**: CSV/XLSX, column mapping, per-event RSVP column and value mapping, update-RSVP mode (by Guest ID or row order). Duplicate names are safe because nothing matches on names.
- **Seating list / floor plan**: party link/unlink, search, collapsible Unseated panel, over-capacity in red, group colors with spotlight and a color ring per table, details panel, double-click pop-up (button / Esc / outside click).
- **Pending / declined**: declined and removed guests are never shown; pending are hidden by default, shown dashed with a "no RSVP" tag when toggled on, and keep their seats while hidden. Manual "treat as coming" / "remove".
- **Free and anchored layouts**: anchored snaps to the nearest slot (slot sets the seats), replaced tables go to the Unplaced tray, dragging to the tray unplaces; unplaced tables do not count toward seats.
- **Layout editor**: image/PDF background, add/drag/rotate/resize table spots, round / rectangle / curved shapes, walls, doors, zones, labels, duplicate, mirror, real-world scale. A built-in "Default" room (square, 12 round tables) or upload your own floor plan.
- **Auto-seat** with "seat together" / "keep apart" rules; never over-fills; reports what does not fit.
- **Export**: seating CSV, floor-plan PDF, alphabetical escort list (PDF/CSV), per-table lists, dietary summary; whole-project JSON export/import.
- **Undo/redo** (Ctrl+Z / Ctrl+Shift+Z), keyboard alternatives for dragging (tap-select + "Seat at…", arrow keys on tables, spot picker for anchored tables), light/dark/system themes with contrast-checked group colors.

## Not built yet
- Milestone 6: accounts, cloud sync and share links. Storage sits behind `ProjectRepo` (`src/db.ts`) so a cloud repo can be added.
- Wall vertices can be drawn and deleted but not edited point by point.
- PDFs use a standard Latin-1 font, so other scripts print as "?" there (CSV keeps everything).

## Privacy
No real guest data is in this repository. Sample data (`src/lib/sample.ts`, `tests/fixtures`) is fictional.
