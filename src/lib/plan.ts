import type { Guest, Layout, Party, Plan, Project, SeatEvent, Slot, Status, Table } from '../types';
import { uid } from './util';

/* Pure helpers over the data model. Everything matches on ids, never names. */

export const statusOf = (g: Guest, eventId: string): Status => g.status[eventId] ?? 'not invited';

/** Effective RSVP after manual overrides. */
export function effectiveStatus(g: Guest, plan: Plan, eventId: string): Status {
  const o = plan.overrides[g.id];
  if (o === 'removed') return 'declined';
  if (o === 'coming') return 'confirmed';
  return statusOf(g, eventId);
}
export const isPending = (g: Guest, plan: Plan, eventId: string) => effectiveStatus(g, plan, eventId) === 'pending';
/** Declined / not invited / removed are never shown. Pending only when the toggle is on. */
export function isVisible(g: Guest, plan: Plan, eventId: string) {
  const s = effectiveStatus(g, plan, eventId);
  return s === 'confirmed' || (s === 'pending' && plan.showPending);
}

export const guestName = (g: Guest) => `${g.firstName} ${g.lastName}`.trim();

export interface Ctx {
  project: Project;
  event: SeatEvent;
  layout: Layout;
}
export function ctxFor(project: Project, eventId: string | null): Ctx | null {
  const event = project.events.find((e) => e.id === eventId) ?? project.events[0];
  if (!event) return null;
  const layout = project.layouts.find((l) => l.id === event.layoutId) ?? project.layouts[0];
  return layout ? { project, event, layout } : null;
}

export const visibleGuests = (c: Ctx) => c.project.guests.filter((g) => isVisible(g, c.event.plan, c.event.id));
export const pendingGuests = (c: Ctx) => c.project.guests.filter((g) => isPending(g, c.event.plan, c.event.id));
export const partyMembers = (c: Ctx, partyId: string) => visibleGuests(c).filter((g) => g.partyId === partyId);

export function isLinked(c: Ctx, partyId: string) {
  const p = c.project.parties.find((x) => x.id === partyId);
  return !!p && p.linked && !c.event.plan.unlinkedPartyIds.includes(partyId) && partyMembers(c, partyId).length > 1;
}
/** Everyone who moves together with this guest. */
export const moveSet = (c: Ctx, g: Guest) => (isLinked(c, g.partyId) ? partyMembers(c, g.partyId) : [g]);

export function partyLabel(c: Ctx, party: Party | undefined, partyId: string) {
  let m = partyMembers(c, partyId);
  if (!m.length) m = c.project.guests.filter((g) => g.partyId === partyId);
  if (m.length === 1) return guestName(m[0]);
  if (party?.label) return party.label;
  const lasts = new Set(m.map((x) => x.lastName));
  return lasts.size === 1 ? m.map((x) => x.firstName).join(', ') + ' ' + m[0].lastName : m.map(guestName).join(' & ');
}

export const slotOf = (layout: Layout, t: Table): Slot | undefined => layout.slots.find((s) => s.id === t.slotId);
export const isPlaced = (layout: Layout, t: Table) => layout.mode === 'free' || t.slotId != null;

/** Anchored: the slot decides. Free: the per-table setting, else the event default. */
export function seatsOf(layout: Layout, plan: Plan, t: Table): number {
  if (layout.mode === 'anchored') {
    const s = slotOf(layout, t);
    if (s) return s.seats;
    return t.seatsOverride ?? plan.defaultSeats;
  }
  return t.seatsOverride ?? plan.defaultSeats;
}

export const seatedAt = (c: Ctx, tableId: string) => visibleGuests(c).filter((g) => c.event.plan.assignments[g.id] === tableId);
export const unseated = (c: Ctx) => visibleGuests(c).filter((g) => !c.event.plan.assignments[g.id] || !c.event.plan.tables.some((t) => t.id === c.event.plan.assignments[g.id]));

export function totalSeats(c: Ctx) {
  return c.event.plan.tables.filter((t) => isPlaced(c.layout, t)).reduce((a, t) => a + seatsOf(c.layout, c.event.plan, t), 0);
}

/** Free-mode table size when it has no slot. Matches the prototype's seat-based sizing. */
export const sizeForSeats = (seats: number) => Math.min(11.2, 7 + seats * 0.42);

export function tableBox(layout: Layout, plan: Plan, t: Table) {
  const s = slotOf(layout, t);
  if (s) return { w: s.w, h: s.h, rotation: s.rotation, shape: s.shape };
  const d = sizeForSeats(seatsOf(layout, plan, t));
  return { w: d, h: d, rotation: 0, shape: 'round' as const };
}

export function tablePos(layout: Layout, t: Table): { x: number; y: number } | null {
  if (layout.mode === 'anchored') {
    const s = slotOf(layout, t);
    return s ? { x: s.x, y: s.y } : null;
  }
  if (t.pos) return t.pos;
  const s = slotOf(layout, t);
  return s ? { x: s.x, y: s.y } : { x: 0.5, y: 0.5 };
}

export function freeSpot(layout: Layout, plan: Plan): { x: number; y: number } {
  const taken = plan.tables.map((t) => tablePos(layout, t)).filter(Boolean) as { x: number; y: number }[];
  const r = layout.ratio;
  for (let y = 0.12; y < 0.92; y += 0.04)
    for (let x = 0.08; x < 0.92; x += 0.04)
      if (taken.every((p) => Math.hypot((p.x - x) * r, p.y - y) > 0.13)) return { x, y };
  return { x: 0.5, y: 0.8 };
}

export function nextTableName(plan: Plan) {
  const used = new Set(plan.tables.map((t) => t.name));
  for (let i = plan.tables.length + 1; ; i++) if (!used.has('Table ' + i)) return 'Table ' + i;
}

/** Fresh plan with one table per slot of the layout. */
export function planFromLayout(layout: Layout): Plan {
  const counts = new Map<number, number>();
  layout.slots.forEach((s) => counts.set(s.seats, (counts.get(s.seats) ?? 0) + 1));
  const defaultSeats = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;
  const plan: Plan = { tables: [], assignments: {}, showPending: false, unlinkedPartyIds: [], defaultSeats, overrides: {}, rules: [] };
  layout.slots.forEach((s, i) => {
    plan.tables.push({
      id: uid('tbl'),
      name: s.label ? `Table ${s.label}` : `Table ${i + 1}`,
      slotId: s.id,
      seatsOverride: layout.mode === 'free' && s.seats !== defaultSeats ? s.seats : null,
    });
  });
  return plan;
}

/** Deep copy of a plan with fresh table ids (used when duplicating an event). */
export function clonePlan(plan: Plan): Plan {
  const map = new Map(plan.tables.map((t) => [t.id, uid('tbl')]));
  return {
    ...structuredClone(plan),
    tables: plan.tables.map((t) => ({ ...structuredClone(t), id: map.get(t.id)! })),
    assignments: Object.fromEntries(Object.entries(plan.assignments).filter(([, t]) => map.has(t)).map(([g, t]) => [g, map.get(t)!])),
    rules: plan.rules.map((r) => ({ ...structuredClone(r), id: uid('rule') })),
  };
}

export function groupColor(project: Project, groupId: string | null) {
  return groupId ? `var(--g-${groupId}, var(--muted))` : 'var(--muted)';
}
export const groupName = (project: Project, id: string | null) => project.groups.find((g) => g.id === id)?.name ?? 'No group';

/** Conic gradient showing the group mix of a table. */
export function ringCss(project: Project, members: Guest[]): string {
  if (!members.length) return 'var(--line)';
  const order = [...project.groups.map((g) => g.id), null];
  let acc = 0;
  const parts: string[] = [];
  order.forEach((id) => {
    const n = members.filter((g) => g.groupId === id).length;
    if (!n) return;
    const a = (acc / members.length) * 360, b = ((acc + n) / members.length) * 360;
    parts.push(`${groupColor(project, id)} ${a}deg ${b}deg`);
    acc += n;
  });
  return `conic-gradient(${parts.join(',')})`;
}
