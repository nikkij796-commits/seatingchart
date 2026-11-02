import { useRef, useState, type PointerEvent as RPE } from 'react';
import { useStore } from '../store';
import type { Table } from '../types';
import { Ctx, groupColor, groupName, isPlaced, moveSet, ringCss, seatedAt, seatsOf, slotOf, tableBox, tablePos } from '../lib/plan';
import { PartyGroups, Chip } from './Chips';
import { dnd } from '../hooks';

function placeSelected(c: Ctx, tableId: string) {
  const st = useStore.getState();
  if (!st.selGuest) return false;
  const g = c.project.guests.find((x) => x.id === st.selGuest);
  if (!g) return false;
  st.moveGuests(moveSet(c, g).map((x) => x.id), tableId);
  return true;
}

export function GroupMix({ c, tableId }: { c: Ctx; tableId: string }) {
  const m = seatedAt(c, tableId);
  if (!m.length) return <div className="mix" />;
  return (
    <div className="mix">
      {[...c.project.groups.map((g) => g.id), null].map((id) => {
        const n = m.filter((g) => g.groupId === id).length;
        return n ? <i key={id ?? 'none'} style={{ ['--hc' as string]: groupColor(c.project, id), flex: n }} title={`${groupName(c.project, id)}: ${n}`} /> : null;
      })}
    </div>
  );
}

/* ---------------- Seating list ---------------- */
export function TableCard({ t, c }: { t: Table; c: Ctx }) {
  const st = useStore.getState();
  const spot = useStore((s) => s.spotlight);
  const m = seatedAt(c, t.id), cap = seatsOf(c.layout, c.event.plan, t), n = m.length;
  const slot = slotOf(c.layout, t);
  const anchored = c.layout.mode === 'anchored';
  const cls = n > cap ? ' overcap' : n === cap && cap > 0 ? ' full' : '';
  const dim = spot && !m.some((g) => g.groupId === spot) ? ' dim' : '';
  return (
    <div
      className={`table${cls}${dim}`}
      data-table={t.id}
      onClick={(e) => { if ((e.target as HTMLElement).closest('input,button,label,[data-guest]')) return; placeSelected(c, t.id); }}
      onDragOver={(e) => { if (dnd.ids) { e.preventDefault(); e.currentTarget.classList.add('over'); } }}
      onDragLeave={(e) => e.currentTarget.classList.remove('over')}
      onDrop={(e) => { if (!dnd.ids) return; e.preventDefault(); const ids = dnd.ids; dnd.ids = null; e.currentTarget.classList.remove('over'); st.moveGuests(ids, t.id); }}
    >
      <div className="thead" onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('input,button')) st.set({ modalTable: t.id, selTable: t.id }); }}>
        <div className="trow">
          <input className="tname" key={t.name} defaultValue={t.name} aria-label="Table name"
            onBlur={(e) => e.target.value.trim() !== t.name && st.renameTable(t.id, e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          <span className={`count${n > cap ? ' bad' : ''}`} aria-label={`${n} of ${cap} seats`}>{n}/{cap}</span>
          <button className="x" onClick={() => st.removeTable(t.id)} title="Remove table (guests go back to Unseated)" aria-label={`Remove ${t.name}`}>×</button>
        </div>
        <GroupMix c={c} tableId={t.id} />
        <div className="trow">
          <label className="capin">Seats
            <input type="number" min={1} max={60} key={`${t.id}-${cap}-${t.seatsOverride}`} defaultValue={anchored && slot ? slot.seats : t.seatsOverride ?? ''} placeholder={String(c.event.plan.defaultSeats)}
              disabled={anchored && !!slot} title={anchored && slot ? "Set by this table's spot in the room" : undefined} aria-label={`Seats at ${t.name}`}
              onBlur={(e) => { const v = parseInt(e.target.value, 10); st.setSeatsOverride(t.id, v > 0 ? v : null); }} />
          </label>
          {anchored && !slot && <span className="badge">unplaced</span>}
        </div>
      </div>
      <div className="tbody">{n ? <PartyGroups list={m} c={c} where={t.id} /> : <div className="empty">Drop guests here</div>}</div>
    </div>
  );
}

export function TableList({ c }: { c: Ctx }) {
  return (
    <div className="tables" id="tableList">
      {c.event.plan.tables.map((t) => <TableCard key={t.id} t={t} c={c} />)}
      {!c.event.plan.tables.length && <div className="empty">No tables yet. Use the + next to Tables.</div>}
    </div>
  );
}

/* ---------------- Floor plan ---------------- */
interface Drag { tid: string; sx: number; sy: number; ox: number; oy: number; moved: boolean; tray: boolean; x: number; y: number; cx: number; cy: number; hot: string | null; overTray: boolean }

function NodeView({ t, c, pos, tray, ghost, dragging, over, onProps }: { t: Table; c: Ctx; pos?: { x: number; y: number } | null; tray?: boolean; ghost?: boolean; dragging?: boolean; over?: boolean; onProps?: object }) {
  const spot = useStore((s) => s.spotlight);
  const selT = useStore((s) => s.selTable === t.id);
  const m = seatedAt(c, t.id), cap = seatsOf(c.layout, c.event.plan, t), n = m.length;
  const box = tableBox(c.layout, c.event.plan, t);
  const p = pos ?? tablePos(c.layout, t) ?? { x: 0.5, y: 0.5 };
  const L = t.name.length, nf = L <= 8 ? 1 : L <= 12 ? 0.85 : L <= 18 ? 0.72 : 0.6;
  const dim = spot && !m.some((g) => g.groupId === spot);
  const style: Record<string, string | number> = { '--ring': ringCss(c.project, m), '--nf': nf, '--rot': `${tray || ghost ? 0 : box.rotation}deg` };
  if (!tray && !ghost) Object.assign(style, { '--x': p.x, '--y': p.y, '--w': box.w, '--h': box.h });
  return (
    <div
      className={`node ${box.shape === 'round' ? 'round' : box.shape}${tray ? ' tray-n' : ''}${ghost ? ' ghost' : ''}${selT ? ' selT' : ''}${n > cap ? ' overcap' : ''}${dim ? ' dim' : ''}${dragging ? ' dragging2' : ''}${over ? ' over' : ''}`}
      data-table={t.id} tabIndex={ghost ? -1 : 0} role="button" aria-label={`${t.name}, ${n} of ${cap} seats`} title={`${t.name}: ${n}/${cap}`}
      style={style} {...onProps}
    >
      <div className="core"><span className="nm">{t.name}</span><span className={`ct${n > cap ? ' bad' : ''}`}>{n}/{cap}</span></div>
    </div>
  );
}

export function FloorPlan({ c }: { c: Ctx }) {
  const st = useStore.getState();
  const anchored = c.layout.mode === 'anchored';
  const stageRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const dref = useRef<Drag | null>(null);
  const justDragged = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overT, setOverT] = useState<string | null>(null);
  const plan = c.event.plan;
  const placed = plan.tables.filter((t) => isPlaced(c.layout, t));
  const unplaced = plan.tables.filter((t) => !isPlaced(c.layout, t));
  const selT = useStore((s) => s.selTable);

  const nearest = (px: number, py: number, r: DOMRect) => {
    let best: string | null = null, bd = 1e9;
    c.layout.slots.forEach((s) => { const d = Math.hypot(r.left + s.x * r.width - px, r.top + s.y * r.height - py); if (d < bd) { bd = d; best = s.id; } });
    return bd <= 0.085 * r.width ? best : null;
  };
  const inTray = (px: number, py: number) => { const b = trayRef.current?.getBoundingClientRect(); return !!b && px >= b.left && px <= b.right && py >= b.top && py <= b.bottom; };

  const down = (e: RPE, t: Table, tray: boolean) => {
    if (e.button > 0) return;
    const p = tablePos(c.layout, t) ?? { x: 0.5, y: 0.5 };
    const d: Drag = { tid: t.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false, tray, x: p.x, y: p.y, cx: e.clientX, cy: e.clientY, hot: null, overTray: false };
    dref.current = d;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: RPE) => {
    const d = dref.current, r = stageRef.current?.getBoundingClientRect();
    if (!d || !r) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    const nd: Drag = { ...d, moved: true, cx: e.clientX, cy: e.clientY };
    if (anchored) {
      nd.x = (e.clientX - r.left) / r.width; nd.y = (e.clientY - r.top) / r.height;
      nd.hot = nearest(e.clientX, e.clientY, r); nd.overTray = !nd.hot && !d.tray && inTray(e.clientX, e.clientY);
    } else { nd.x = Math.max(0.03, Math.min(0.97, d.ox + dx / r.width)); nd.y = Math.max(0.03, Math.min(0.97, d.oy + dy / r.height)); }
    dref.current = nd; setDrag(nd);
  };
  const up = () => {
    const d = dref.current; dref.current = null; setDrag(null);
    if (!d || !d.moved) return;
    justDragged.current = true; setTimeout(() => (justDragged.current = false), 80);
    if (anchored) {
      if (d.hot) st.placeTable(d.tid, d.hot);
      else if (d.overTray) st.placeTable(d.tid, null);
    } else st.moveTableFree(d.tid, d.x, d.y);
  };
  const click = (t: Table) => {
    if (justDragged.current) return;
    if (placeSelected(c, t.id)) return;
    st.set({ selTable: t.id });
  };
  const keys = (e: React.KeyboardEvent, t: Table) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!placeSelected(c, t.id)) st.set({ selTable: t.id }); return; }
    if (anchored || !e.key.startsWith('Arrow')) return;
    e.preventDefault();
    const p = tablePos(c.layout, t)!, step = e.shiftKey ? 0.05 : 0.01;
    st.moveTableFree(t.id, p.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), p.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0));
  };
  const nodeProps = (t: Table, tray: boolean) => ({
    onPointerDown: (e: RPE) => down(e, t, tray), onPointerMove: move, onPointerUp: up, onPointerCancel: up,
    onClick: () => click(t), onDoubleClick: () => st.set({ modalTable: t.id, selTable: t.id }), onKeyDown: (e: React.KeyboardEvent) => keys(e, t),
    onDragOver: (e: React.DragEvent) => { if (dnd.ids) { e.preventDefault(); setOverT(t.id); } },
    onDragLeave: () => setOverT(null),
    onDrop: (e: React.DragEvent) => { if (!dnd.ids) return; e.preventDefault(); const ids = dnd.ids; dnd.ids = null; setOverT(null); st.moveGuests(ids, t.id); },
  });
  const dragTbl = drag?.moved ? plan.tables.find((t) => t.id === drag.tid) : undefined;

  return (
    <div className="floorwrap" id="floorwrap">
      <div className="floorscroll">
        <div className="floor" style={{ ['--ratio' as string]: c.layout.ratio, ['--minw' as string]: c.layout.ratio < 1 ? '380px' : '640px' }}>
          <div className="stage" ref={stageRef} id="stage" data-mode={c.layout.mode}>
            <LayoutArt layout={c.layout} />
            {anchored && c.layout.slots.map((s) => (
              <div key={s.id} className={`slot ${s.shape}${plan.tables.some((t) => t.slotId === s.id) ? ' occ' : ''}${drag?.hot === s.id ? ' hot' : ''}`} data-slot={s.id}
                style={{ ['--x' as string]: s.x, ['--y' as string]: s.y, ['--w' as string]: s.w, ['--h' as string]: s.h, ['--rot' as string]: `${s.rotation}deg` }}>
                <span>{s.seats} seats</span>
              </div>
            ))}
            <div className="nodes">
              {placed.map((t) => {
                const isD = drag?.moved && drag.tid === t.id && !drag.tray;
                return <NodeView key={t.id} t={t} c={c} pos={isD ? { x: drag!.x, y: drag!.y } : null} dragging={!!isD} over={overT === t.id} onProps={nodeProps(t, false)} />;
              })}
            </div>
          </div>
          {anchored && (
            <div className={`tray${drag?.overTray ? ' over' : ''}`} ref={trayRef} id="tray">
              <div className="tray-h">Unplaced tables ({unplaced.length})</div>
              <div className="tray-b">
                {unplaced.map((t) => <NodeView key={t.id} t={t} c={c} tray over={overT === t.id} onProps={nodeProps(t, true)} />)}
                {!unplaced.length && <div className="empty">Drag a table here to unplace it.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
      {drag?.moved && drag.tray && dragTbl && (
        <div style={{ position: 'fixed', left: drag.cx, top: drag.cy, width: 74, height: 74, zIndex: 40, pointerEvents: 'none', transform: 'translate(-50%,-50%)' }}>
          <NodeView t={dragTbl} c={c} tray ghost />
        </div>
      )}
      <aside className="detail" id="detail" style={{ visibility: selT && plan.tables.some((t) => t.id === selT) ? 'visible' : 'hidden' }} aria-live="polite">
        <TableDetail c={c} />
      </aside>
    </div>
  );
}

export function LayoutArt({ layout }: { layout: Ctx['layout'] }) {
  return (
    <>
      {layout.background && <img className="bg" src={layout.background.dataUrl} alt="" style={{ opacity: layout.background.opacity }} draggable={false} />}
      <svg className="fx" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        {layout.shapes.map((s) => {
          if ((s.kind === 'wall' || s.kind === 'door') && s.points)
            return <path key={s.id} className={s.kind} d={'M' + s.points.map(([x, y]) => `${x} ${y}`).join('L') + (s.closed ? 'Z' : '')} />;
          if (s.kind === 'zone')
            return s.round ? <ellipse key={s.id} className="zone" cx={(s.x ?? 0) + (s.w ?? 0) / 2} cy={(s.y ?? 0) + (s.h ?? 0) / 2} rx={(s.w ?? 0) / 2} ry={(s.h ?? 0) / 2} /> : <rect key={s.id} className="zone" x={s.x} y={s.y} width={s.w} height={s.h} />;
          return null;
        })}
      </svg>
      {layout.shapes.filter((s) => (s.kind === 'label' || s.kind === 'zone') && s.text).map((s) => (
        <div key={s.id} className="lbl" style={{ left: `${((s.kind === 'zone' ? (s.x ?? 0) + (s.w ?? 0) / 2 : s.x) ?? 0) * 100}%`, top: `${((s.kind === 'zone' ? (s.y ?? 0) + (s.h ?? 0) / 2 : s.y) ?? 0) * 100}%` }}>{s.text}</div>
      ))}
    </>
  );
}

export function TableDetail({ c }: { c: Ctx }) {
  const st = useStore.getState();
  const selT = useStore((s) => s.selTable);
  const t = c.event.plan.tables.find((x) => x.id === selT);
  if (!t) return null;
  const m = seatedAt(c, t.id), cap = seatsOf(c.layout, c.event.plan, t);
  const anchored = c.layout.mode === 'anchored';
  const used = new Set(c.event.plan.tables.filter((x) => x.id !== t.id).map((x) => x.slotId));
  return (
    <>
      <div className="dhead">
        <h3>{t.name}</h3><span className={`count${m.length > cap ? ' bad' : ''}`}>{m.length}/{cap}</span>
        <button className="xbtn" onClick={() => st.set({ selTable: null })} aria-label="Close table details" title="Close">×</button>
      </div>
      <div className="pills">
        {c.project.groups.map((g) => { const k = m.filter((x) => x.groupId === g.id).length; return k ? <span key={g.id} className="pill" style={{ ['--hc' as string]: groupColor(c.project, g.id) }}><i />{g.name} {k}</span> : null; })}
      </div>
      <div className="dbody">{m.length ? <PartyGroups list={m} c={c} where={t.id} /> : <div className="empty">No one is seated here yet.</div>}</div>
      {anchored && (
        <label className="field">Spot in the room (keyboard alternative to dragging)
          <select value={t.slotId ?? ''} onChange={(e) => st.placeTable(t.id, e.target.value || null)} aria-label="Spot in the room">
            <option value="">Unplaced</option>
            {c.layout.slots.map((s, i) => <option key={s.id} value={s.id}>{`Spot ${s.label ?? i + 1} (${s.seats} seats)${used.has(s.id) ? ' - swap' : ''}`}</option>)}
          </select>
        </label>
      )}
      <div className="row">
        <button className="btn sm" onClick={() => st.set({ modalTable: t.id })}>View guests</button>
        {m.length > 0 && <button className="btn sm" data-clear={t.id} onClick={() => st.unseatTable(t.id)}>Unseat this table</button>}
      </div>
    </>
  );
}

export function TableModal({ c }: { c: Ctx }) {
  const id = useStore((s) => s.modalTable);
  const close = () => useStore.getState().set({ modalTable: null });
  const t = c.event.plan.tables.find((x) => x.id === id);
  if (!t) return null;
  const m = seatedAt(c, t.id), cap = seatsOf(c.layout, c.event.plan, t);
  const byP = new Map<string, typeof m>();
  m.forEach((g) => byP.set(g.partyId, [...(byP.get(g.partyId) ?? []), g]));
  return (
    <div className="modal" id="modal" role="dialog" aria-modal="true" aria-label="Table guests" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="card">
        <div className="dhead"><h3>{t.name}</h3><span className={`count${m.length > cap ? ' bad' : ''}`}>{m.length}/{cap}</span>
          <button className="xbtn" onClick={close} aria-label="Exit" title="Exit (Esc)">×</button></div>
        <div className="dbody">
          {m.length ? [...byP.values()].map((l) => (l.length > 1 ? <div className="grp" key={l[0].partyId}>{l.map((g) => <Chip key={g.id} g={g} c={c} readOnly />)}</div> : <Chip key={l[0].id} g={l[0]} c={c} readOnly />)) : <div className="empty">No one is seated here yet.</div>}
        </div>
        <div className="btnrow"><button className="btn primary" onClick={close} autoFocus>Exit</button></div>
      </div>
    </div>
  );
}
