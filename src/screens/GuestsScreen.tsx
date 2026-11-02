import { useState } from 'react';
import { useStore } from '../store';
import { useCtx } from '../hooks';
import { STATUSES, type Status } from '../types';
import { effectiveStatus } from '../lib/plan';
import { uid } from '../lib/util';

export function GuestsScreen() {
  const c = useCtx();
  const project = useStore((s) => s.project);
  const st = useStore.getState();
  const [q, setQ] = useState('');
  const ev = c?.event;
  const ql = q.trim().toLowerCase();
  const guests = project.guests.filter((g) => !ql || `${g.firstName} ${g.lastName} ${g.dietary} ${g.notes}`.toLowerCase().includes(ql));
  return (
    <div className="page">
      <div className="row">
        <h2 style={{ flex: 1 }}>Guests ({project.guests.length})</h2>
        <input type="search" placeholder="Search guests" aria-label="Search guests" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => st.addGuest({})}>Add guest</button>
        <button className="btn" onClick={() => st.set({ dialog: 'groups' })}>Groups &amp; colors</button>
        <button className="btn primary" id="importBtn" onClick={() => st.set({ dialog: 'import' })} disabled={!ev} title={ev ? '' : 'Create an event first'}>Import CSV / Excel</button>
      </div>
      {!ev && <div className="hint">Create an event first, then import guests into it.</div>}
      {ev && <div className="hint">RSVP shown is for <b>{ev.name}</b>. Guests who declined are never shown on the seating chart. Pending guests appear only when you turn on “Include guests who haven't RSVPed”.</div>}
      <div className="gwrap">
        <table className="gtable" id="guestTable">
          <thead><tr><th>First name</th><th>Last name</th><th>Group</th><th>Dietary</th><th>Notes</th><th>RSVP{ev ? ` (${ev.name})` : ''}</th><th>Override</th><th /></tr></thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.id} data-guest-row={g.id}>
                <td data-label="First name"><input aria-label="First name" key={g.firstName} defaultValue={g.firstName} onBlur={(e) => st.updateGuest(g.id, { firstName: e.target.value.trim() })} /></td>
                <td data-label="Last name"><input aria-label="Last name" key={g.lastName} defaultValue={g.lastName} onBlur={(e) => st.updateGuest(g.id, { lastName: e.target.value.trim() })} /></td>
                <td data-label="Group"><select aria-label="Group" value={g.groupId ?? ''} onChange={(e) => st.updateGuest(g.id, { groupId: e.target.value || null })}>
                  <option value="">None</option>{project.groups.map((gr) => <option key={gr.id} value={gr.id}>{gr.name}</option>)}</select></td>
                <td data-label="Dietary"><input aria-label="Dietary" key={g.dietary} defaultValue={g.dietary} onBlur={(e) => st.updateGuest(g.id, { dietary: e.target.value.trim() })} /></td>
                <td data-label="Notes"><input aria-label="Notes" key={g.notes} defaultValue={g.notes} onBlur={(e) => st.updateGuest(g.id, { notes: e.target.value.trim() })} /></td>
                <td data-label="RSVP">{ev && <select aria-label="RSVP" value={g.status[ev.id] ?? 'not invited'} onChange={(e) => st.setGuestStatus(g.id, e.target.value as Status)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>}</td>
                <td data-label="Override">{ev && <select aria-label="Override" value={ev.plan.overrides[g.id] ?? ''} onChange={(e) => st.setOverride(g.id, (e.target.value || null) as 'coming' | 'removed' | null)} title={`Effective: ${effectiveStatus(g, ev.plan, ev.id)}`}>
                  <option value="">As RSVP</option><option value="coming">Treat as coming</option><option value="removed">Remove</option></select>}</td>
                <td className="row actions" style={{ flexWrap: 'nowrap' }}>
                  <button className="btn sm" title="Put this guest in their own party" onClick={() => { const pid = uid('party'); st.commit((d) => { d.parties.push({ id: pid, label: '', linked: true }); const x = d.guests.find((y) => y.id === g.id); if (x) x.partyId = pid; }); }}>Own party</button>
                  <button className="x" aria-label={`Delete ${g.firstName} ${g.lastName}`} onClick={() => st.deleteGuest(g.id)}>×</button>
                </td>
              </tr>
            ))}
            {!guests.length && <tr><td colSpan={8}><div className="empty">No guests yet. Import a CSV or Excel file, or add one by hand.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
