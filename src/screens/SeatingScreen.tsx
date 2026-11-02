import { useState } from 'react';
import { useStore } from '../store';
import { useCtx, dnd } from '../hooks';
import { Ctx, groupColor, guestName, moveSet, partyLabel, pendingGuests, seatedAt, totalSeats, unseated, visibleGuests, seatsOf } from '../lib/plan';
import { PartyGroups } from '../components/Chips';
import { FloorPlan, TableList, TableModal } from '../components/TableViews';

function Stepper({ id, label, value, onChange, min, max }: { id: string; label: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <div className="ctl"><label htmlFor={id}>{label}</label>
      <div className="step">
        <button onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Fewer ${label.toLowerCase()}`}>−</button>
        <input id={id} type="number" min={min} max={max} key={value} defaultValue={value} onBlur={(e) => onChange(Math.min(max, Math.max(min, parseInt(e.target.value, 10) || min)))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        <button onClick={() => onChange(Math.min(max, value + 1))} aria-label={`More ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  );
}

function Toolbar({ c }: { c: Ctx }) {
  const st = useStore.getState();
  const [armed, setArmed] = useState(false);
  const saveState = useStore((s) => s.saveState);
  const vis = visibleGuests(c), un = unseated(c);
  const seated = vis.length - un.length;
  const over = c.event.plan.tables.filter((t) => seatedAt(c, t.id).length > seatsOf(c.layout, c.event.plan, t)).length;
  const events = c.project.events;
  const [more, setMore] = useState(false);
  return (
    <>
      <div className="bar">
        <div className="evtabs" role="tablist" aria-label="Event">
          {events.map((e) => (
            <button key={e.id} className="tab" role="tab" aria-selected={e.id === c.event.id} onClick={() => st.set({ eventId: e.id, selGuest: null, selTable: null, modalTable: null, query: '' })}>{e.name}</button>
          ))}
        </div>
        <button className="btn primary" id="auto" onClick={() => st.runAutoSeat()}>Auto-seat the rest</button>
        <button className="btn" onClick={() => st.set({ dialog: 'rules' })}>Rules{c.event.plan.rules.length ? ` (${c.event.plan.rules.length})` : ''}</button>
        <button className="btn" onClick={() => st.set({ dialog: 'export' })}>Export</button>
        <button className="btn more-btn" aria-expanded={more} aria-controls="moreBody" onClick={() => setMore((m) => !m)}>{more ? 'Less' : 'Tables & more'}</button>
        <div id="moreBody" className={`more-body${more ? ' open' : ''}`}>
          <Stepper id="nTables" label="Tables" value={c.event.plan.tables.length} min={0} max={80} onChange={(n) => st.setTableCount(n)} />
          {c.layout.mode === 'free' && <Stepper id="defCap" label="People per table" value={c.event.plan.defaultSeats} min={1} max={60} onChange={(n) => st.setDefaultSeats(n)} />}
          <button className={`btn warn${armed ? ' armed' : ''}`} id="clear" onClick={() => { if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3000); } else { setArmed(false); st.unseatAll(); } }}>{armed ? 'Click again to confirm' : 'Unseat everyone'}</button>
        </div>
        <span className="sp" />
        <div className="stats" id="stats">
          <span><b>{seated}</b> / {vis.length} seated</span>
          <span><b>{totalSeats(c)}</b> seats</span>
          {over > 0 && <span className="bad"><b>{over}</b> over capacity</span>}
          <span className="saved">{saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Not saved'}</span>
        </div>
      </div>
      <Legend c={c} />
    </>
  );
}

function Legend({ c }: { c: Ctx }) {
  const spot = useStore((s) => s.spotlight);
  const vis = visibleGuests(c), un = new Set(unseated(c).map((g) => g.id));
  return (
    <div className="legend" id="legend">
      <span className="hint">Group</span>
      {c.project.groups.map((g) => {
        const tot = vis.filter((x) => x.groupId === g.id), s = tot.filter((x) => !un.has(x.id)).length;
        return (
          <button key={g.id} className="hostbtn" data-group={g.id} aria-pressed={spot === g.id} style={{ ['--hc' as string]: groupColor(c.project, g.id) }}
            onClick={() => useStore.getState().set({ spotlight: spot === g.id ? null : g.id })}>
            <i className="dot" />{g.name} <small>{s}/{tot.length}</small>
          </button>
        );
      })}
      <button className="btn sm" onClick={() => useStore.getState().set({ dialog: 'groups' })}>Edit groups &amp; colors</button>
      {c.project.groups.length > 0 && <span className="hint">Click a group to spotlight its guests.</span>}
    </div>
  );
}

function Pool({ c }: { c: Ctx }) {
  const st = useStore.getState();
  const query = useStore((s) => s.query);
  const collapsed = useStore((s) => s.poolCollapsed);
  const [over, setOver] = useState(false);
  const un = unseated(c);
  const pend = pendingGuests(c);
  const hid = c.event.plan.showPending ? 0 : pend.filter((g) => c.event.plan.assignments[g.id]).length;
  const ql = query.trim().toLowerCase();
  const gOrd = (id: string | null) => { const i = c.project.groups.findIndex((g) => g.id === id); return i < 0 ? 999 : i; };
  const list = un.filter((g) => !ql || guestName(g).toLowerCase().includes(ql) || partyLabel(c, c.project.parties.find((p) => p.id === g.partyId), g.partyId).toLowerCase().includes(ql))
    .sort((a, b) => gOrd(a.groupId) - gOrd(b.groupId) || a.partyId.localeCompare(b.partyId));
  return (
    <section className={`pane pool${over ? ' over' : ''}`} id="pool" aria-label="Unseated guests"
      onDragOver={(e) => { if (dnd.ids) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (!dnd.ids) return; e.preventDefault(); const ids = dnd.ids; dnd.ids = null; setOver(false); st.moveGuests(ids, null); }}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('input,button,label,[data-guest]') && st.selGuest) { const g = c.project.guests.find((x) => x.id === st.selGuest); if (g) st.moveGuests(moveSet(c, g).map((x) => x.id), null); } }}>
      <div className="pool-head">
        <h2 id="poolTitle">Unseated ({un.length})</h2>
        <button className="xbtn" id="poolToggle" onClick={() => st.set({ poolCollapsed: !collapsed })} title="Collapse or expand this panel" aria-label={collapsed ? 'Expand Unseated panel' : 'Collapse Unseated panel'}>{collapsed ? '›' : '‹'}</button>
        {collapsed && <b>{un.length}</b>}
        <input type="search" placeholder="Find a guest" aria-label="Find a guest" value={query} onChange={(e) => st.set({ query: e.target.value })} />
      </div>
      <label className="tog" htmlFor="showPend">
        <input type="checkbox" id="showPend" checked={c.event.plan.showPending} onChange={(e) => st.setShowPending(e.target.checked)} />
        <span>Include guests who haven't RSVPed <b id="pendN">({pend.length})</b>
          <small id="pendNote">{hid ? `${hid} hidden guest${hid > 1 ? 's' : ''} keep their table and come back when this is on.` : 'Guests who declined are never shown.'}</small></span>
      </label>
      <div className="scroll"><div className="pool-list" id="poolList">
        {list.length ? <PartyGroups list={list} c={c} where={null} /> : <div className="empty">{un.length ? 'No match.' : visibleGuests(c).length ? 'Everyone has a seat.' : 'No guests yet. Import a guest list from the Guests tab.'}</div>}
      </div></div>
    </section>
  );
}

function SelBar({ c }: { c: Ctx }) {
  const st = useStore.getState();
  const sel = useStore((s) => s.selGuest);
  const g = c.project.guests.find((x) => x.id === sel);
  if (!g) return null;
  const set = moveSet(c, g);
  return (
    <div className="sel-bar" id="selbar" role="status">
      <span>{set.length > 1 ? `${partyLabel(c, c.project.parties.find((p) => p.id === g.partyId), g.partyId)} (${set.length})` : guestName(g)} selected. Tap a table to seat.</span>
      <select aria-label="Seat at table" value="" onChange={(e) => { if (e.target.value === '__none') st.moveGuests(set.map((x) => x.id), null); else if (e.target.value) st.moveGuests(set.map((x) => x.id), e.target.value); }}>
        <option value="">Seat at…</option>
        {c.event.plan.tables.map((t) => <option key={t.id} value={t.id}>{t.name} ({seatedAt(c, t.id).length}/{seatsOf(c.layout, c.event.plan, t)})</option>)}
        <option value="__none">Unseated</option>
      </select>
      <button onClick={() => st.set({ selGuest: null })}>Cancel</button>
    </div>
  );
}

export function SeatingScreen() {
  const c = useCtx();
  const view = useStore((s) => s.view);
  const collapsed = useStore((s) => s.poolCollapsed);
  const st = useStore.getState();
  if (!c) return <div className="page"><div className="empty">Create an event first.</div></div>;
  return (
    <>
      <Toolbar c={c} />
      <div className={`main${collapsed ? ' collapsed' : ''}`}>
        <Pool c={c} />
        <section className="pane" aria-label="Tables">
          <div className="tabs" role="tablist">
            <button className="tab" id="tabList" role="tab" aria-selected={view === 'list'} onClick={() => st.set({ view: 'list' })}>Seating list</button>
            <button className="tab" id="tabFloor" role="tab" aria-selected={view === 'floor'} onClick={() => st.set({ view: 'floor' })}>Floor plan</button>
            <span className="sp" />
            {view === 'floor' && <button className="btn" id="arrange" onClick={() => st.resetLayout()} title="Put every table back where the venue layout has it">Reset layout</button>}
          </div>
          {view === 'list' ? (
            <>
              <div className="hint" style={{ paddingBottom: 8 }}>Drag a guest or party onto a table. Parties stay together while the link is on. Click the link icon on a party to split it up. On a touch screen, tap a guest, then tap a table.</div>
              <TableList c={c} />
            </>
          ) : <FloorPlan c={c} />}
          <SelBar c={c} />
        </section>
      </div>
      <TableModal c={c} />
    </>
  );
}
