import type { Guest } from '../types';
import { Ctx, isLinked, isPlaced, seatsOf, unseated, visibleGuests, partyMembers } from './plan';

export interface AutoSeatResult {
  assignments: Record<string, string>;
  placed: number;
  notFit: { guestIds: string[]; reason: string }[];
}

/** Seat every unseated, visible guest. Keeps linked parties together, groups by group, respects capacity and
 *  the optional together/apart rules, and only uses placed tables. Never over-fills: leftovers are reported. */
export function autoSeat(c: Ctx): AutoSeatResult {
  const plan = c.event.plan;
  const assignments = { ...plan.assignments };
  const tables = plan.tables.filter((t) => isPlaced(c.layout, t));
  const vis = visibleGuests(c);
  const visIds = new Set(vis.map((g) => g.id));
  const groupOrder = new Map(c.project.groups.map((g, i) => [g.id, i] as const));

  const expand = (ref: { kind: 'guest' | 'party'; id: string }): string[] =>
    ref.kind === 'guest' ? (visIds.has(ref.id) ? [ref.id] : []) : partyMembers(c, ref.id).map((g) => g.id);

  // keep-apart pairs
  const apart = new Map<string, Set<string>>();
  const together: [string, string][] = [];
  plan.rules.forEach((r) => {
    const A = expand(r.a), B = expand(r.b);
    if (r.type === 'apart') {
      A.forEach((a) => B.forEach((b) => { if (a !== b) { (apart.get(a) ?? apart.set(a, new Set()).get(a)!).add(b); (apart.get(b) ?? apart.set(b, new Set()).get(b)!).add(a); } }));
    } else A.forEach((a) => B.forEach((b) => a !== b && together.push([a, b])));
  });

  // units = linked parties + singles, then merge "seat together" rules
  const un = unseated(c);
  const unIds = new Set(un.map((g) => g.id));
  const parent = new Map<string, string>(un.map((g) => [g.id, g.id]));
  const root = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, root(parent.get(x)!)), parent.get(x)!));
  const union = (a: string, b: string) => parent.set(root(a), root(b));
  un.forEach((g) => { if (isLinked(c, g.partyId)) partyMembers(c, g.partyId).forEach((m) => unIds.has(m.id) && union(g.id, m.id)); });
  together.forEach(([a, b]) => { if (unIds.has(a) && unIds.has(b)) union(a, b); });
  const unitMap = new Map<string, Guest[]>();
  un.forEach((g) => { const r = root(g.id); (unitMap.get(r) ?? unitMap.set(r, []).get(r)!).push(g); });
  const units = [...unitMap.values()];

  const gOrd = (u: Guest[]) => groupOrder.get(u[0].groupId ?? '') ?? 999;
  units.sort((a, b) => gOrd(a) - gOrd(b) || b.length - a.length);

  const at = (tid: string) => Object.entries(assignments).filter(([g, t]) => t === tid && visIds.has(g)).map(([g]) => g);
  const notFit: AutoSeatResult['notFit'] = [];
  let placed = 0;

  for (const u of units) {
    const ids = u.map((g) => g.id);
    // a table where an already-seated "together" partner or linked partymate sits
    const partnerTables = new Set<string>();
    together.forEach(([a, b]) => {
      if (ids.includes(a) && assignments[b] && !unIds.has(b)) partnerTables.add(assignments[b]);
      if (ids.includes(b) && assignments[a] && !unIds.has(a)) partnerTables.add(assignments[a]);
    });
    u.forEach((g) => { if (isLinked(c, g.partyId)) partyMembers(c, g.partyId).forEach((m) => assignments[m.id] && !unIds.has(m.id) && partnerTables.add(assignments[m.id])); });

    const fits = tables.filter((t) => {
      const here = at(t.id);
      if (seatsOf(c.layout, plan, t) - here.length < u.length) return false;
      return !ids.some((id) => [...(apart.get(id) ?? [])].some((o) => here.includes(o)));
    });
    const preferred = fits.find((t) => partnerTables.has(t.id));
    const sameGroup = fits.find((t) => at(t.id).some((id) => vis.find((g) => g.id === id)?.groupId === u[0].groupId));
    const t = preferred ?? sameGroup ?? fits[0];
    if (!t) {
      const biggest = Math.max(0, ...tables.map((x) => seatsOf(c.layout, plan, x)));
      const reason = !tables.length ? 'No tables are placed.' : u.length > biggest ? `Group of ${u.length} is larger than any table.` : 'No table has room that satisfies the rules.';
      notFit.push({ guestIds: ids, reason });
      continue;
    }
    ids.forEach((id) => (assignments[id] = t.id));
    placed += ids.length;
  }
  return { assignments, placed, notFit };
}
