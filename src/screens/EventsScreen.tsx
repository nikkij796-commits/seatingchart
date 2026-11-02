import { useState } from 'react';
import { useStore } from '../store';
import { ctxFor, seatsOf, unseated, visibleGuests } from '../lib/plan';

export function EventsScreen() {
  const project = useStore((s) => s.project);
  const eventId = useStore((s) => s.eventId);
  const st = useStore.getState();
  const [name, setName] = useState('');
  const [layoutId, setLayoutId] = useState('');
  const [invite, setInvite] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const lid = layoutId || project.layouts[0]?.id || '';
  return (
    <div className="page">
      <form className="card2" onSubmit={(e) => { e.preventDefault(); st.createEvent(name || 'New event', lid, invite || null); setName(''); }}>
        <h2>{project.events.length ? 'New event' : 'Create your first event'}</h2>
        <div className="row">
          <input aria-label="Event name" placeholder="Event name (for example, Reception)" value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: 220 }} />
          <label className="field row">Room layout
            <select aria-label="Room layout" value={lid} onChange={(e) => setLayoutId(e.target.value)}>
              {project.layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          {project.events.length > 0 && (
            <label className="field row">Invite
              <select aria-label="Invite guests" value={invite} onChange={(e) => setInvite(e.target.value)}>
                <option value="">nobody yet</option>
                {project.events.map((e) => <option key={e.id} value={e.id}>same guests as {e.name}</option>)}
              </select>
            </label>
          )}
          <button className="btn primary" type="submit">Create event</button>
        </div>
        <span className="hint">Each event has its own seating plan. You can upload a floor plan or edit rooms on the Layouts tab.</span>
      </form>
      <div className="cards" id="eventCards">
        {project.events.map((e) => {
          const c = ctxFor(project, e.id)!;
          const vis = visibleGuests(c), un = unseated(c);
          const seats = e.plan.tables.reduce((a, t) => a + seatsOf(c.layout, e.plan, t), 0);
          return (
            <div key={e.id} className={`card2${e.id === eventId ? ' cur' : ''}`} data-event={e.id}>
              <input className="tname" style={{ fontSize: 18 }} key={e.name} defaultValue={e.name} aria-label="Event name"
                onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.name && st.renameEvent(e.id, ev.target.value)} />
              <div className="hint">{c.layout.name} · {e.plan.tables.length} tables · {seats} seats</div>
              <div className="stats"><span><b>{vis.length - un.length}</b> / {vis.length} seated</span></div>
              <div className="row">
                <button className="btn primary" onClick={() => st.set({ eventId: e.id, screen: 'seating' })}>Open</button>
                <button className="btn" onClick={() => st.duplicateEvent(e.id)}>Duplicate plan</button>
                {confirmDel === e.id
                  ? <button className="btn danger" onClick={() => { st.deleteEvent(e.id); setConfirmDel(null); }}>Confirm delete</button>
                  : <button className="btn danger" onClick={() => setConfirmDel(e.id)}>Delete</button>}
              </div>
              <label className="field row">Layout
                <select value={e.layoutId} aria-label={`Layout for ${e.name}`} onChange={(ev) => st.setEventLayout(e.id, ev.target.value)}>
                  {project.layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
