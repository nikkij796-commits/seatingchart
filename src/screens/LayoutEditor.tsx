import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { useStore } from '../store';
import type { FixedShape, Layout, Slot, SlotShape } from '../types';
import { LayoutArt } from '../components/TableViews';
import { fileToBackground } from '../lib/background';
import { clamp, uid } from '../lib/util';

type Tool = 'select' | 'table' | 'wall' | 'door' | 'zone' | 'label';
type Sel = { type: 'slot' | 'shape'; id: string } | null;
type Gesture =
  | { kind: 'move'; type: 'slot' | 'shape'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { kind: 'rotate' | 'resize'; id: string }
  | { kind: 'zone'; sx: number; sy: number };

const num = (v: string, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

export function LayoutEditor() {
  const st = useStore.getState();
  const id = useStore((s) => s.editorLayoutId);
  const layout = useStore((s) => s.project.layouts.find((l) => l.id === id));
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<Sel>(null);
  const [pv, setPv] = useState<{ type: 'slot' | 'shape'; id: string; patch: Record<string, number> } | null>(null);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [zoneDraft, setZoneDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const g = useRef<Gesture | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const finishPath = (closed: boolean) => {
    if (!layout || draft.length < 2) { setDraft([]); return; }
    const shape: FixedShape = { id: uid('shp'), kind: tool === 'door' ? 'door' : 'wall', points: draft, closed: closed && tool === 'wall' };
    st.updateLayout(layout.id, (l) => { l.shapes.push(shape); });
    setDraft([]);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea')) return;
      if (e.key === 'Enter' && draft.length) finishPath(false);
      else if (e.key === 'Escape') { setDraft([]); setZoneDraft(null); setSel(null); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel && layout) { e.preventDefault(); remove(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  if (!layout) return <div className="page"><div className="empty">Layout not found.</div><button className="btn" onClick={() => st.set({ screen: 'layouts' })}>Back to layouts</button></div>;

  const L: Layout = layout;
  const slotEff = (s: Slot): Slot => (pv && pv.type === 'slot' && pv.id === s.id ? { ...s, ...pv.patch } : s);
  const shapeEff = (s: FixedShape): FixedShape => (pv && pv.type === 'shape' && pv.id === s.id ? { ...s, ...pv.patch } : s);
  const pt = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1), r };
  };
  const upd = (fn: (l: Layout) => void) => st.updateLayout(L.id, fn as never);
  const patchSlot = (sid: string, p: Partial<Slot>) => upd((l) => { const s = l.slots.find((x) => x.id === sid); if (s) Object.assign(s, p); });
  const patchShape = (sid: string, p: Partial<FixedShape>) => upd((l) => { const s = l.shapes.find((x) => x.id === sid); if (s) Object.assign(s, p); });
  function remove() {
    if (!sel) return;
    upd((l) => { if (sel.type === 'slot') l.slots = l.slots.filter((s) => s.id !== sel.id); else l.shapes = l.shapes.filter((s) => s.id !== sel.id); });
    setSel(null);
  }

  /* ----- canvas background interactions ----- */
  const stageDown = (e: RPE) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('bg') && (e.target as HTMLElement).tagName !== 'svg') return;
    const p = pt(e);
    if (tool === 'table') {
      const slot: Slot = { id: uid('slot'), x: p.x, y: p.y, shape: 'round', seats: 10, w: 11.2, h: 11.2, rotation: 0, label: String(L.slots.length + 1) };
      upd((l) => { l.slots.push(slot); });
      setSel({ type: 'slot', id: slot.id });
    } else if (tool === 'wall' || tool === 'door') setDraft((d) => [...d, [p.x, p.y]]);
    else if (tool === 'label') {
      const s: FixedShape = { id: uid('shp'), kind: 'label', x: p.x, y: p.y, text: 'LABEL' };
      upd((l) => { l.shapes.push(s); });
      setSel({ type: 'shape', id: s.id }); setTool('select');
    } else if (tool === 'zone') {
      g.current = { kind: 'zone', sx: p.x, sy: p.y };
      setZoneDraft({ x: p.x, y: p.y, w: 0, h: 0 });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } else setSel(null);
  };
  const stageMove = (e: RPE) => {
    const gg = g.current; if (!gg) return;
    const p = pt(e);
    if (gg.kind === 'zone') setZoneDraft({ x: Math.min(gg.sx, p.x), y: Math.min(gg.sy, p.y), w: Math.abs(p.x - gg.sx), h: Math.abs(p.y - gg.sy) });
    else if (gg.kind === 'move') {
      const dx = (e.clientX - gg.sx) / p.r.width, dy = (e.clientY - gg.sy) / p.r.height;
      if (!gg.moved && Math.hypot(dx * p.r.width, dy * p.r.height) < 3) return;
      gg.moved = true;
      setPv({ type: gg.type, id: gg.id, patch: { x: clamp(gg.ox + dx, 0, 1), y: clamp(gg.oy + dy, 0, 1) } });
    } else {
      const s = L.slots.find((x) => x.id === gg.id); if (!s) return;
      const cx = p.r.left + s.x * p.r.width, cy = p.r.top + s.y * p.r.height;
      if (gg.kind === 'rotate') {
        let a = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
        if (e.shiftKey) a = Math.round(a / 15) * 15;
        setPv({ type: 'slot', id: s.id, patch: { rotation: Math.round(((a % 360) + 360) % 360) } });
      } else {
        const rad = (-s.rotation * Math.PI) / 180, vx = e.clientX - cx, vy = e.clientY - cy;
        const lx = Math.abs(vx * Math.cos(rad) - vy * Math.sin(rad)), ly = Math.abs(vx * Math.sin(rad) + vy * Math.cos(rad));
        const w = Math.max(3, +((2 * lx) / p.r.width * 100).toFixed(1)), h = Math.max(3, +((2 * ly) / p.r.width * 100).toFixed(1));
        setPv({ type: 'slot', id: s.id, patch: s.shape === 'round' ? { w: Math.max(w, h), h: Math.max(w, h) } : { w, h } });
      }
    }
  };
  const stageUp = () => {
    const gg = g.current; g.current = null;
    if (gg?.kind === 'zone' && zoneDraft && zoneDraft.w > 0.01 && zoneDraft.h > 0.01) {
      const s: FixedShape = { id: uid('shp'), kind: 'zone', ...zoneDraft, text: 'ZONE' };
      upd((l) => { l.shapes.push(s); });
      setSel({ type: 'shape', id: s.id }); setTool('select');
    }
    setZoneDraft(null);
    if (pv && gg && gg.kind !== 'zone') {
      if (pv.type === 'slot') patchSlot(pv.id, pv.patch as Partial<Slot>); else patchShape(pv.id, pv.patch as Partial<FixedShape>);
    }
    setPv(null);
  };
  const startMove = (e: RPE, type: 'slot' | 'shape', sid: string, x: number, y: number) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    setSel({ type, id: sid });
    g.current = { kind: 'move', type, id: sid, sx: e.clientX, sy: e.clientY, ox: x, oy: y, moved: false };
    stage.current!.setPointerCapture(e.pointerId);
  };
  const startHandle = (e: RPE, kind: 'rotate' | 'resize', sid: string) => { e.stopPropagation(); g.current = { kind, id: sid }; stage.current!.setPointerCapture(e.pointerId); };

  const copySlot = (s: Slot, mirror: boolean) => {
    const c: Slot = { ...s, id: uid('slot'), label: String(L.slots.length + 1) };
    if (mirror) { c.x = 1 - s.x; c.rotation = (360 - s.rotation) % 360; if (Math.abs(c.x - s.x) < 0.03) c.x = clamp(s.x + 0.08, 0, 1); }
    else { c.x = clamp(s.x + 0.04, 0, 1); c.y = clamp(s.y + 0.04, 0, 1); }
    upd((l) => { l.slots.push(c); });
    setSel({ type: 'slot', id: c.id });
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr('');
    try { const bg = await fileToBackground(f); upd((l) => { l.background = { dataUrl: bg.dataUrl, opacity: l.background?.opacity ?? 0.6 }; l.ratio = bg.ratio; }); }
    catch { setErr('Could not read that image or PDF.'); }
    setBusy(false);
  };

  const slot = sel?.type === 'slot' ? L.slots.find((s) => s.id === sel.id) : undefined;
  const shape = sel?.type === 'shape' ? L.shapes.find((s) => s.id === sel.id) : undefined;
  const W = L.widthMeters;
  const unit = W ? 'm' : '% of width';
  const toU = (pct: number) => (W ? +(pct * W / 100).toFixed(2) : +pct.toFixed(1));
  const fromU = (v: number) => (W ? (v * 100) / W : v);

  return (
    <div className="page" style={{ overflow: 'hidden' }}>
      <div className="row">
        <button className="btn" onClick={() => st.set({ screen: 'layouts' })}>← Layouts</button>
        <input aria-label="Layout name" key={L.name} defaultValue={L.name} style={{ minWidth: 220, fontWeight: 600 }} onBlur={(e) => e.target.value.trim() && upd((l) => { l.name = e.target.value.trim(); })} />
        <div className="navtabs" role="toolbar" aria-label="Tools">
          {([['select', 'Select'], ['table', 'Add table'], ['wall', 'Wall'], ['door', 'Door'], ['zone', 'Zone'], ['label', 'Label']] as [Tool, string][]).map(([k, label]) => (
            <button key={k} className="tab" aria-pressed={tool === k} aria-selected={tool === k} data-tool={k} onClick={() => { setTool(k); setDraft([]); }}>{label}</button>
          ))}
        </div>
        {draft.length > 0 && <>
          <button className="btn sm" onClick={() => finishPath(false)}>Finish line</button>
          {tool === 'wall' && <button className="btn sm" onClick={() => finishPath(true)}>Close shape</button>}
        </>}
        <span className="sp" />
        <span className="hint">{tool === 'table' ? 'Click the room to add a table.' : tool === 'wall' || tool === 'door' ? 'Click to add points. Enter finishes.' : tool === 'zone' ? 'Drag to draw a zone.' : tool === 'label' ? 'Click to place a label.' : 'Drag to move. Use the handles to rotate and resize.'}</span>
      </div>
      <div className="editor">
        <div className="canvaswrap">
          <div className={`canvas${tool === 'select' ? ' sel-tool' : ''}`} style={{ ['--ratio' as string]: L.ratio }}>
            <div className="stage" ref={stage} id="editorStage" onPointerDown={stageDown} onPointerMove={stageMove} onPointerUp={stageUp} onPointerCancel={stageUp}>
              <LayoutArt layout={L} />
              {L.shapes.filter((s) => s.kind === 'zone' || s.kind === 'label').map((raw) => {
                const s = shapeEff(raw);
                const zone = s.kind === 'zone';
                return (
                  <div key={s.id} className={`ed-shape${zone ? ' ed-zone' : ''}${sel?.id === s.id ? ' selected' : ''}`} data-shape={s.id}
                    style={zone ? { left: `${(s.x ?? 0) * 100}%`, top: `${(s.y ?? 0) * 100}%`, width: `${(s.w ?? 0) * 100}%`, height: `${(s.h ?? 0) * 100}%`, borderRadius: s.round ? '50%' : 4, background: 'transparent', color: 'transparent' }
                      : { left: `${(s.x ?? 0) * 100}%`, top: `${(s.y ?? 0) * 100}%`, transform: 'translate(-50%,-50%)', padding: '4px 10px', color: 'transparent', whiteSpace: 'nowrap' }}
                    onPointerDown={(e) => startMove(e, 'shape', s.id, zone ? s.x ?? 0 : s.x ?? 0, s.y ?? 0)}>{s.text}</div>
                );
              })}
              {L.slots.map((raw) => {
                const s = slotEff(raw);
                const selected = sel?.id === s.id;
                return (
                  <div key={s.id} className={`ed-slot ${s.shape === 'round' ? 'round' : s.shape}${selected ? ' selected' : ''}`} data-slot={s.id} tabIndex={0}
                    style={{ ['--x' as string]: s.x, ['--y' as string]: s.y, ['--w' as string]: s.w, ['--h' as string]: s.h, ['--rot' as string]: `${s.rotation}deg`, ['--u' as string]: '1cqw' }}
                    onPointerDown={(e) => startMove(e, 'slot', s.id, s.x, s.y)}
                    onKeyDown={(e) => {
                      if (e.key.startsWith('Arrow')) { e.preventDefault(); const k = e.shiftKey ? 0.05 : 0.01; patchSlot(s.id, { x: clamp(s.x + (e.key === 'ArrowRight' ? k : e.key === 'ArrowLeft' ? -k : 0), 0, 1), y: clamp(s.y + (e.key === 'ArrowDown' ? k : e.key === 'ArrowUp' ? -k : 0), 0, 1) }); }
                      else if (e.key === 'Enter') setSel({ type: 'slot', id: s.id });
                    }}>
                    <span>{s.label ?? ''}<br />{s.seats}</span>
                    {selected && tool === 'select' && <>
                      <i className="handle rot" data-handle="rotate" title="Rotate (Shift snaps to 15°)" onPointerDown={(e) => startHandle(e, 'rotate', s.id)} />
                      <i className="handle size" data-handle="resize" title="Resize" onPointerDown={(e) => startHandle(e, 'resize', s.id)} />
                    </>}
                  </div>
                );
              })}
              {(draft.length > 0 || zoneDraft) && (
                <svg className="fx" viewBox="0 0 1 1" preserveAspectRatio="none">
                  {draft.length > 0 && <polyline className="wall" style={{ stroke: 'var(--accent)' }} points={draft.map(([x, y]) => `${x},${y}`).join(' ')} />}
                  {zoneDraft && <rect x={zoneDraft.x} y={zoneDraft.y} width={zoneDraft.w} height={zoneDraft.h} className="zone" />}
                </svg>
              )}
            </div>
          </div>
        </div>
        <aside className="inspector" aria-label="Layout settings">
          <b>Room</b>
          <label className="field">Table behavior
            <select aria-label="Layout mode" value={L.mode} onChange={(e) => upd((l) => { l.mode = e.target.value as Layout['mode']; })}>
              <option value="free">Free: tables sit anywhere</option>
              <option value="anchored">Anchored: tables snap to spots, spot sets seats</option>
            </select>
          </label>
          <label className="field">Floor plan image or PDF
            <input type="file" id="bgFile" accept="image/*,application/pdf" onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
          {busy && <span className="hint"><span className="spin" /> Reading file…</span>}
          {err && <span className="warn-txt" role="alert">{err}</span>}
          {L.background && (
            <div className="row">
              <label className="field row">Opacity
                <input type="range" min={0.1} max={1} step={0.05} defaultValue={L.background.opacity} aria-label="Background opacity" onChange={(e) => upd((l) => { if (l.background) l.background.opacity = +e.target.value; })} />
              </label>
              <button className="btn sm" onClick={() => upd((l) => { delete l.background; })}>Remove</button>
            </div>
          )}
          <label className="field">Scale: room width in metres (optional)
            <input type="number" min={1} step={0.5} aria-label="Room width in metres" key={String(W)} defaultValue={W ?? ''} placeholder="for example 24"
              onBlur={(e) => { const v = num(e.target.value, 0); upd((l) => { if (v > 0) l.widthMeters = v; else delete l.widthMeters; }); }} />
          </label>
          <hr style={{ width: '100%', borderColor: 'var(--line)' }} />
          {slot && (
            <div id="slotInspector" className="dbody">
              <b>Table spot</b>
              <label className="field">Label<input aria-label="Spot label" key={slot.id + 'l'} defaultValue={slot.label ?? ''} onBlur={(e) => patchSlot(slot.id, { label: e.target.value })} /></label>
              <label className="field">Shape
                <select aria-label="Spot shape" value={slot.shape} onChange={(e) => { const sh = e.target.value as SlotShape; patchSlot(slot.id, { shape: sh, ...(sh === 'round' ? { h: slot.w } : {}), ...(sh === 'curved' ? { seats: Math.min(slot.seats, 6) } : {}) }); }}>
                  <option value="round">Round</option><option value="rectangle">Rectangle</option><option value="curved">Curved (serpentine)</option>
                </select>
              </label>
              <label className="field">Seats<input type="number" min={1} max={60} aria-label="Spot seats" key={slot.id + slot.seats} defaultValue={slot.seats} onBlur={(e) => patchSlot(slot.id, { seats: clamp(Math.round(num(e.target.value, slot.seats)), 1, 60) })} /></label>
              <div className="row">
                <label className="field">Width ({unit})<input type="number" step="0.1" aria-label="Spot width" key={slot.id + 'w' + slot.w} defaultValue={toU(slot.w)} onBlur={(e) => { const w = Math.max(2, fromU(num(e.target.value, toU(slot.w)))); patchSlot(slot.id, slot.shape === 'round' ? { w, h: w } : { w }); }} style={{ width: 90 }} /></label>
                {slot.shape !== 'round' && <label className="field">Depth ({unit})<input type="number" step="0.1" aria-label="Spot depth" key={slot.id + 'h' + slot.h} defaultValue={toU(slot.h)} onBlur={(e) => patchSlot(slot.id, { h: Math.max(2, fromU(num(e.target.value, toU(slot.h)))) })} style={{ width: 90 }} /></label>}
              </div>
              <div className="row">
                <label className="field">Rotation (°)<input type="number" aria-label="Spot rotation" key={slot.id + 'r' + slot.rotation} defaultValue={slot.rotation} onBlur={(e) => patchSlot(slot.id, { rotation: ((Math.round(num(e.target.value, 0)) % 360) + 360) % 360 })} style={{ width: 80 }} /></label>
                <button className="btn sm" onClick={() => patchSlot(slot.id, { rotation: (slot.rotation + 345) % 360 })} aria-label="Rotate left 15 degrees">⟲ 15°</button>
                <button className="btn sm" onClick={() => patchSlot(slot.id, { rotation: (slot.rotation + 15) % 360 })} aria-label="Rotate right 15 degrees">⟳ 15°</button>
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => copySlot(slot, false)}>Duplicate</button>
                <button className="btn sm" onClick={() => copySlot(slot, true)}>Mirror</button>
                <button className="btn sm danger" onClick={remove}>Delete</button>
              </div>
            </div>
          )}
          {shape && (
            <div className="dbody">
              <b>{shape.kind[0].toUpperCase() + shape.kind.slice(1)}</b>
              {(shape.kind === 'label' || shape.kind === 'zone') && <label className="field">Text<input aria-label="Shape text" key={shape.id + 't'} defaultValue={shape.text ?? ''} onBlur={(e) => patchShape(shape.id, { text: e.target.value })} /></label>}
              {shape.kind === 'zone' && <>
                <label className="field row"><input type="checkbox" checked={!!shape.round} onChange={(e) => patchShape(shape.id, { round: e.target.checked })} style={{ height: 'auto' }} /> Round</label>
                <div className="row">
                  <label className="field">Width %<input type="number" step="1" key={shape.id + 'zw' + shape.w} defaultValue={Math.round((shape.w ?? 0) * 100)} onBlur={(e) => patchShape(shape.id, { w: clamp(num(e.target.value, 10) / 100, 0.01, 1) })} style={{ width: 70 }} /></label>
                  <label className="field">Height %<input type="number" step="1" key={shape.id + 'zh' + shape.h} defaultValue={Math.round((shape.h ?? 0) * 100)} onBlur={(e) => patchShape(shape.id, { h: clamp(num(e.target.value, 10) / 100, 0.01, 1) })} style={{ width: 70 }} /></label>
                </div>
              </>}
              <button className="btn sm danger" onClick={remove}>Delete</button>
            </div>
          )}
          <b>Walls, doors, zones, labels</b>
          <div className="dbody">
            {L.shapes.map((s) => (
              <button key={s.id} className="btn sm" style={{ textAlign: 'left', outline: sel?.id === s.id ? '2px solid var(--sel)' : undefined }} onClick={() => setSel({ type: 'shape', id: s.id })}>{s.kind}{s.text ? `: ${s.text}` : ''}</button>
            ))}
            {!L.shapes.length && <span className="hint">None yet.</span>}
          </div>
          <span className="hint">{L.slots.length} table spots, {L.slots.reduce((a, s) => a + s.seats, 0)} seats. Changes save automatically and apply to every event that uses this layout.</span>
        </aside>
      </div>
    </div>
  );
}
