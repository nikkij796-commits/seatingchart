import { useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { useCtx } from '../hooks';
import { STATUSES, type Project, type Status } from '../types';
import { EMPTY_MAPPING, Mapping, ImportMode, ImportSummary, Sheet, defaultStatusMap, guessMapping, parseFile } from '../lib/importer';
import { sampleRows, emptyProject } from '../lib/sample';
import { contrastReport, adjustForTheme } from '../lib/contrast';
import { download } from '../lib/util';
import { assignmentCsv, dietaryCsv, dietaryPdf, escortCsv, escortPdf, floorPlanPdf, tableListsPdf } from '../lib/exporters';
import { guestName } from '../lib/plan';

function Dialog({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`card${wide ? ' wide' : ''}`}>
        <div className="dhead"><h3>{title}</h3><button className="xbtn" onClick={onClose} aria-label="Close dialog">×</button></div>
        {children}
      </div>
    </div>
  );
}

const FIELDS: { key: keyof Mapping; label: string }[] = [
  { key: 'fullName', label: 'Name (full)' }, { key: 'firstName', label: 'First name' }, { key: 'lastName', label: 'Last name' },
  { key: 'party', label: 'Party / household' }, { key: 'group', label: 'Group / host' }, { key: 'dietary', label: 'Dietary' },
  { key: 'notes', label: 'Notes' }, { key: 'rsvp', label: 'RSVP status' }, { key: 'externalId', label: 'Guest ID' },
];

function ImportWizard() {
  const st = useStore.getState();
  const c = useCtx();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);
  const [statusMap, setStatusMap] = useState<Record<string, Status>>({});
  const [mode, setMode] = useState<ImportMode>('new');
  const [err, setErr] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const close = () => st.set({ dialog: null });
  const load = (s: Sheet) => { const m = guessMapping(s.headers); setSheet(s); setMapping(m); setStatusMap(defaultStatusMap(s, m.rsvp)); };
  const setMap = (k: keyof Mapping, v: number | null) => {
    const m = { ...mapping, [k]: v };
    setMapping(m);
    if (k === 'rsvp' && sheet) setStatusMap(defaultStatusMap(sheet, v));
  };
  if (!c) return null;
  if (summary) return (
    <Dialog title="Import complete" onClose={close}>
      <p id="importSummary">{summary.added ? `Added ${summary.added} guests.` : `Updated ${summary.updated} guests.`} {summary.skipped ? `${summary.skipped} rows skipped. ` : ''}{summary.groupsCreated ? `${summary.groupsCreated} groups created. ` : ''}
        For {c.event.name}: {summary.byStatus.confirmed} confirmed, {summary.byStatus.pending} pending, {summary.byStatus.declined} declined, {summary.byStatus['not invited']} not invited.</p>
      <div className="btnrow"><button className="btn primary" onClick={close}>Done</button></div>
    </Dialog>
  );
  return (
    <Dialog title={`Import guests into ${c.event.name}`} onClose={close} wide>
      {!sheet ? (
        <>
          <label className="field">Choose a CSV or Excel (.xlsx) file
            <input type="file" id="importFile" accept=".csv,.tsv,.txt,.xlsx,.xls" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              try { const s = await parseFile(f); if (!s.rows.length) setErr('That file has no data rows.'); else { setErr(''); load(s); } } catch { setErr('Could not read that file.'); }
            }} />
          </label>
          {err && <div className="warn-txt" role="alert">{err}</div>}
          <div className="hint">The first row should be column headings. You will match the columns in the next step.</div>
          <div className="btnrow"><button className="btn" onClick={() => { const [h, ...rows] = sampleRows(); load({ headers: h, rows }); }}>Try with fictional sample data</button></div>
        </>
      ) : (
        <>
          <div className="hint">{sheet.rows.length} rows found. Match your columns. Names are never used to match guests, so duplicate names are safe.</div>
          <div className="mapgrid" id="mapping">
            {FIELDS.map((f) => (
              <label key={f.key} style={{ display: 'contents' }}>
                <span>{f.label}</span>
                <select aria-label={f.label} value={mapping[f.key] ?? ''} onChange={(e) => setMap(f.key, e.target.value === '' ? null : +e.target.value)}>
                  <option value="">(not in file)</option>
                  {sheet.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          {mapping.rsvp != null && (
            <div id="statusMap">
              <b>What each RSVP value means for {c.event.name}</b>
              <div className="mapgrid" style={{ marginTop: 6 }}>
                {Object.keys(statusMap).map((v) => (
                  <label key={v || '__blank'} style={{ display: 'contents' }}>
                    <span>{v === '' ? '(blank)' : v}</span>
                    <select aria-label={`RSVP value ${v === '' ? 'blank' : v}`} value={statusMap[v]} onChange={(e) => setStatusMap({ ...statusMap, [v]: e.target.value as Status })}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}
          {mapping.rsvp == null && <div className="hint">No RSVP column chosen: everyone will be marked confirmed for {c.event.name}.</div>}
          <label className="field">What to do
            <select aria-label="Import mode" value={mode} onChange={(e) => setMode(e.target.value as ImportMode)}>
              <option value="new">Add these as new guests</option>
              <option value="update-by-id" disabled={mapping.externalId == null}>Update RSVP of existing guests, matched by Guest ID</option>
              <option value="update-by-row">Update RSVP of existing guests, matched by row order</option>
            </select>
          </label>
          <div className="preview"><table><thead><tr>{sheet.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>
            {sheet.rows.slice(0, 5).map((r, i) => <tr key={i}>{sheet.headers.map((_, j) => <td key={j}>{r[j]}</td>)}</tr>)}</tbody></table></div>
          {err && <div className="warn-txt" role="alert">{err}</div>}
          <div className="btnrow">
            <button className="btn" onClick={() => setSheet(null)}>Back</button>
            <button className="btn primary" id="doImport" onClick={() => {
              if (mapping.fullName == null && mapping.firstName == null && mapping.lastName == null) { setErr('Choose a name column.'); return; }
              setSummary(st.importGuests({ sheet, mapping, statusMap, mode }));
            }}>Import</button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function GroupsDialog() {
  const st = useStore.getState();
  const project = useStore((s) => s.project);
  const [name, setName] = useState('');
  return (
    <Dialog title="Groups and colors" onClose={() => st.set({ dialog: null })}>
      <div className="hint">Groups color-code guests (for example the host, side or category). Colors are checked against both light and dark themes and nudged automatically if they would be hard to see.</div>
      {project.groups.map((g) => {
        const r = contrastReport(g.color);
        return (
          <div className="row" key={g.id} data-group-row={g.id}>
            <input type="color" className="swatch" aria-label={`Color for ${g.name}`} value={g.color} onChange={(e) => st.updateGroup(g.id, { color: e.target.value })} />
            <input aria-label="Group name" key={g.name} defaultValue={g.name} onBlur={(e) => e.target.value.trim() && st.updateGroup(g.id, { name: e.target.value.trim() })} />
            <span className={r.okLight && r.okDark ? 'ok-txt' : 'warn-txt'} title={`Contrast on light ${r.light.toFixed(1)}:1, dark ${r.dark.toFixed(1)}:1 (3:1 needed)`}>
              {r.okLight && r.okDark ? 'Good on light and dark' : `Adjusted: ${!r.okLight ? 'light' : ''}${!r.okLight && !r.okDark ? ' & ' : ''}${!r.okDark ? 'dark' : ''} → ${!r.okLight ? adjustForTheme(g.color, 'light') : adjustForTheme(g.color, 'dark')}`}
            </span>
            <button className="x" aria-label={`Delete group ${g.name}`} onClick={() => st.deleteGroup(g.id)}>×</button>
          </div>
        );
      })}
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { st.addGroup(name); setName(''); } }}>
        <input placeholder="New group name" aria-label="New group name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit">Add group</button>
      </form>
      <div className="btnrow"><button className="btn primary" onClick={() => st.set({ dialog: null })}>Done</button></div>
    </Dialog>
  );
}

function RulesDialog() {
  const st = useStore.getState();
  const c = useCtx();
  const [type, setType] = useState<'together' | 'apart'>('together');
  const [ak, setAk] = useState<'guest' | 'party'>('guest');
  const [a, setA] = useState('');
  const [bk, setBk] = useState<'guest' | 'party'>('guest');
  const [b, setB] = useState('');
  if (!c) return null;
  const guests = c.project.guests;
  const opts = (k: 'guest' | 'party') => k === 'guest'
    ? guests.map((g) => <option key={g.id} value={g.id}>{guestName(g)} ({g.id.slice(-4)})</option>)
    : c.project.parties.map((p) => { const m = guests.filter((g) => g.partyId === p.id); return <option key={p.id} value={p.id}>{p.label || m.map((g) => g.firstName).join(', ')}</option>; });
  const refLabel = (r: { kind: 'guest' | 'party'; id: string }) => r.kind === 'guest' ? (guests.find((g) => g.id === r.id) ? guestName(guests.find((g) => g.id === r.id)!) : '?') : (c.project.parties.find((p) => p.id === r.id)?.label || guests.filter((g) => g.partyId === r.id).map((g) => g.firstName).join(', '));
  return (
    <Dialog title={`Seating rules for ${c.event.name}`} onClose={() => st.set({ dialog: null })} wide>
      <div className="hint">Auto-seat follows these. “Seat together” puts them at one table; “Keep apart” never puts them at the same table.</div>
      {c.event.plan.rules.map((r) => (
        <div className="row" key={r.id}><span><b>{r.type === 'together' ? 'Seat together' : 'Keep apart'}</b>: {refLabel(r.a)} and {refLabel(r.b)}</span><span className="sp" />
          <button className="x" aria-label="Delete rule" onClick={() => st.deleteRule(r.id)}>×</button></div>
      ))}
      <div className="row">
        <select aria-label="Rule type" value={type} onChange={(e) => setType(e.target.value as 'together' | 'apart')}><option value="together">Seat together</option><option value="apart">Keep apart</option></select>
        <select aria-label="First kind" value={ak} onChange={(e) => { setAk(e.target.value as 'guest' | 'party'); setA(''); }}><option value="guest">guest</option><option value="party">party</option></select>
        <select aria-label="First" value={a} onChange={(e) => setA(e.target.value)}><option value="">Choose…</option>{opts(ak)}</select>
        <select aria-label="Second kind" value={bk} onChange={(e) => { setBk(e.target.value as 'guest' | 'party'); setB(''); }}><option value="guest">guest</option><option value="party">party</option></select>
        <select aria-label="Second" value={b} onChange={(e) => setB(e.target.value)}><option value="">Choose…</option>{opts(bk)}</select>
        <button className="btn" disabled={!a || !b || (ak === bk && a === b)} onClick={() => { st.addRule({ type, a: { kind: ak, id: a }, b: { kind: bk, id: b } }); setA(''); setB(''); }}>Add rule</button>
      </div>
      <div className="btnrow"><button className="btn primary" onClick={() => st.set({ dialog: null })}>Done</button></div>
    </Dialog>
  );
}

function ExportDialog() {
  const st = useStore.getState();
  const c = useCtx();
  if (!c) return null;
  const n = c.event.name.replace(/[^\w-]+/g, '-').toLowerCase();
  const items: [string, string, () => void][] = [
    ['Seating CSV', 'Every guest with table, group, party, dietary and notes', () => download(`${n}-seating.csv`, assignmentCsv(c), 'text/csv')],
    ['Floor plan PDF', 'The room with every table, name and count', () => download(`${n}-floor-plan.pdf`, floorPlanPdf(c))],
    ['Escort list PDF', 'Alphabetical, with table numbers', () => download(`${n}-escort-list.pdf`, escortPdf(c))],
    ['Escort list CSV', 'Alphabetical, with table numbers', () => download(`${n}-escort-list.csv`, escortCsv(c), 'text/csv')],
    ['Guest lists by table PDF', 'One section per table', () => download(`${n}-tables.pdf`, tableListsPdf(c))],
    ['Dietary summary PDF', 'Counts and who sits where', () => download(`${n}-dietary.pdf`, dietaryPdf(c))],
    ['Dietary summary CSV', 'One row per guest with a dietary need', () => download(`${n}-dietary.csv`, dietaryCsv(c), 'text/csv')],
  ];
  return (
    <Dialog title={`Export ${c.event.name}`} onClose={() => st.set({ dialog: null })}>
      {items.map(([label, desc, fn]) => (
        <div className="row" key={label}><button className="btn" onClick={fn}>{label}</button><span className="hint">{desc}</span></div>
      ))}
      <div className="hint">PDFs use a standard font, so characters outside Latin-1 print as “?”. The CSV files keep every character.</div>
    </Dialog>
  );
}

function ProjectDialog() {
  const st = useStore.getState();
  const [err, setErr] = useState('');
  const [armed, setArmed] = useState(false);
  return (
    <Dialog title="Project" onClose={() => st.set({ dialog: null })}>
      <div className="hint">Everything is stored in this browser and saved automatically. Export a JSON file to back it up or move to another device.</div>
      <div className="row"><button className="btn" id="exportJson" onClick={() => download('seating-project.json', JSON.stringify(useStore.getState().project, null, 2), 'application/json')}>Export project (JSON)</button></div>
      <label className="field">Import a project JSON (replaces the current project; you can undo)
        <input type="file" accept=".json,application/json" id="importJson" onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          try {
            const p = JSON.parse(await f.text()) as Project;
            if (p.version !== 1 || !Array.isArray(p.guests) || !Array.isArray(p.events) || !Array.isArray(p.layouts) || !Array.isArray(p.groups) || !Array.isArray(p.parties)) throw new Error('shape');
            st.loadProject(p); st.set({ dialog: null }); st.toast('Project imported.');
          } catch { setErr('That file is not a valid project export.'); }
        }} />
      </label>
      {err && <div className="warn-txt" role="alert">{err}</div>}
      <div className="row">
        <button className={`btn danger`} onClick={() => { if (!armed) { setArmed(true); return; } st.loadProject(emptyProject()); st.set({ dialog: null }); }}>{armed ? 'Click again to erase everything' : 'Erase project'}</button>
      </div>
      <div className="hint">Accounts, cloud sync and share links are not built yet. The storage layer is isolated so they can be added later.</div>
    </Dialog>
  );
}

export function Dialogs() {
  const d = useStore((s) => s.dialog);
  if (d === 'import') return <ImportWizard />;
  if (d === 'groups') return <GroupsDialog />;
  if (d === 'rules') return <RulesDialog />;
  if (d === 'export') return <ExportDialog />;
  if (d === 'project') return <ProjectDialog />;
  return null;
}
