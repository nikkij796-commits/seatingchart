import type { DragEvent, KeyboardEvent, ReactElement } from 'react';
import type { Guest } from '../types';
import { useStore } from '../store';
import { Ctx, guestName, isLinked, isPending, moveSet, partyLabel, partyMembers, groupName, groupColor } from '../lib/plan';
import { dnd } from '../hooks';

export const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.2-1.2" /></svg>
);
export const UnlinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.8 13.6l1.3-1.3a5 5 0 0 0-7.1-7.1l-1.2 1.2" /><path d="M5.2 10.4l-1.3 1.3a5 5 0 0 0 7.1 7.1l1.2-1.2" /><path d="M3 3l18 18" /></svg>
);

export function startDrag(e: DragEvent, ids: string[]) {
  dnd.ids = ids;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'seat');
}
export function endDrag() {
  dnd.ids = null;
  document.querySelectorAll('.over,.dragging').forEach((x) => x.classList.remove('over', 'dragging'));
}

export function Chip({ g, c, readOnly }: { g: Guest; c: Ctx; readOnly?: boolean }) {
  const sel = useStore((s) => s.selGuest === g.id);
  const spot = useStore((s) => s.spotlight);
  const pend = isPending(g, c.event.plan, c.event.id);
  const override = c.event.plan.overrides[g.id];
  const dim = spot && g.groupId !== spot ? ' dim' : '';
  const toggle = () => useStore.getState().set({ selGuest: sel ? null : g.id });
  const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
  const st = useStore.getState();
  return (
    <div
      className={`chip${dim}${sel ? ' sel' : ''}${pend ? ' pend' : ''}`}
      data-guest={g.id}
      draggable={!readOnly}
      tabIndex={readOnly ? undefined : 0}
      role={readOnly ? undefined : 'button'}
      aria-pressed={readOnly ? undefined : sel}
      style={{ ['--hc' as string]: groupColor(c.project, g.groupId) }}
      title={`${guestName(g)} · ${groupName(c.project, g.groupId)}${pend ? ' · not yet RSVPed' : ''}${g.dietary ? ' · ' + g.dietary : ''}`}
      onClick={readOnly ? undefined : (e) => { e.stopPropagation(); toggle(); }}
      onKeyDown={readOnly ? undefined : key}
      onDragStart={(e) => { (e.currentTarget as HTMLElement).classList.add('dragging'); startDrag(e, moveSet(c, g).map((x) => x.id)); }}
      onDragEnd={endDrag}
    >
      <i className="dot" />
      <span>{guestName(g)}</span>
      {pend && <em className="tag">no RSVP</em>}
      {!readOnly && pend && (
        <>
          <button className="mini" title="Treat as coming" aria-label={`Treat ${guestName(g)} as coming`} onClick={(e) => { e.stopPropagation(); st.setOverride(g.id, 'coming'); }}>coming</button>
          <button className="mini" title="Remove from this event" aria-label={`Remove ${guestName(g)}`} onClick={(e) => { e.stopPropagation(); st.setOverride(g.id, 'removed'); }}>remove</button>
        </>
      )}
      {!readOnly && override === 'coming' && <em className="tag">override</em>}
    </div>
  );
}

/** Guests grouped by party. `where` tells a party drag which table it started from. */
export function PartyGroups({ list, c, where }: { list: Guest[]; c: Ctx; where: string | null }) {
  const spot = useStore((s) => s.spotlight);
  const st = useStore.getState();
  const byParty = new Map<string, Guest[]>();
  list.forEach((g) => { const a = byParty.get(g.partyId) ?? []; a.push(g); byParty.set(g.partyId, a); });
  const out: ReactElement[] = [];
  byParty.forEach((m, pid) => {
    const total = partyMembers(c, pid).length;
    if (total <= 1 && m.length === 1) { out.push(<Chip key={m[0].id} g={m[0]} c={c} />); return; }
    const party = c.project.parties.find((p) => p.id === pid);
    const linked = isLinked(c, pid);
    const dimAll = spot && !m.some((g) => g.groupId === spot) ? ' dimall' : '';
    const label = partyLabel(c, party, pid);
    out.push(
      <div key={pid} className={`grp${linked ? '' : ' broken'}${dimAll}`} data-party={pid}>
        <div className="grp-top" draggable
          onDragStart={(e) => startDrag(e, m.map((g) => g.id))}
          onDragEnd={endDrag}>
          <span>{label}</span>
          <button className={`lk${linked ? ' on' : ''}`} data-link={pid} aria-label={linked ? `Unlink party ${label}` : `Link party ${label}`}
            title={linked ? 'Party is linked. Click to split them up.' : 'Party is split. Click to link and seat them together.'}
            onClick={(e) => { e.stopPropagation(); st.toggleLink(pid); }}>
            {linked ? <LinkIcon /> : <UnlinkIcon />}{linked ? '' : ' split'}
          </button>
        </div>
        {m.map((g) => <Chip key={g.id} g={g} c={c} />)}
      </div>,
    );
  });
  void where;
  return <>{out}</>;
}
