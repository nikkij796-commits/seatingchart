import { describe, expect, it } from 'vitest';
import { applyImport, defaultStatusMap, guessMapping, guessStatus, parseCsv } from '../../src/lib/importer';
import { emptyProject, sampleCsv } from '../../src/lib/sample';
import { autoSeat } from '../../src/lib/autoseat';
import { ctxFor, isVisible, planFromLayout, seatsOf, unseated, visibleGuests, effectiveStatus } from '../../src/lib/plan';
import { welcomeTemplate, receptionTemplate, WELCOME_SEATS } from '../../src/lib/templates';
import { adjustForTheme, contrast, SURFACE } from '../../src/lib/contrast';
import { escortList } from '../../src/lib/exporters';
import type { Project } from '../../src/types';

function setup(layoutKind: 'reception' | 'welcome' = 'reception') {
  const base = emptyProject();
  const layout = layoutKind === 'reception' ? receptionTemplate() : welcomeTemplate();
  const p: Project = { ...base, layouts: [layout], events: [{ id: 'e1', name: 'Event', layoutId: layout.id, plan: planFromLayout(layout) }] };
  const sheet = parseCsv(sampleCsv());
  const mapping = guessMapping(sheet.headers);
  const res = applyImport(p, { sheet, mapping, statusMap: defaultStatusMap(sheet, mapping.rsvp), eventId: 'e1', mode: 'new' });
  return { project: res.project, summary: res.summary };
}

describe('import', () => {
  it('guesses columns and RSVP values', () => {
    const sheet = parseCsv(sampleCsv());
    const m = guessMapping(sheet.headers);
    expect(sheet.headers[m.fullName!]).toBe('Name');
    expect(sheet.headers[m.party!]).toBe('Household');
    expect(sheet.headers[m.group!]).toBe('Side');
    expect(sheet.headers[m.rsvp!]).toBe('RSVP');
    expect(guessStatus('Attending')).toBe('confirmed');
    expect(guessStatus('Not Attending')).toBe('declined');
    expect(guessStatus('')).toBe('pending');
  });
  it('keeps duplicate names as distinct guests with distinct ids', () => {
    const { project } = setup();
    const dup = project.guests.filter((g) => g.firstName === 'Jordan' && g.lastName === 'Elm');
    expect(dup.length).toBe(2);
    expect(dup[0].id).not.toBe(dup[1].id);
    expect(escortList(ctxFor(project, 'e1')!).filter((e) => e.name === 'Elm, Jordan').length).toBeLessThanOrEqual(2);
  });
  it('groups parties by household and creates groups', () => {
    const { project, summary } = setup();
    expect(project.groups.length).toBe(4);
    expect(summary.byStatus.declined).toBeGreaterThan(0);
    expect(project.parties.length).toBe(14);
  });
  it('updates RSVP by row without touching names', () => {
    const { project } = setup();
    const sheet = parseCsv('RSVP\n' + project.guests.map(() => 'Not Attending').join('\n'));
    const r = applyImport(project, { sheet, mapping: { ...guessMapping(sheet.headers), fullName: null }, statusMap: { 'Not Attending': 'declined' }, eventId: 'e1', mode: 'update-by-row' });
    expect(r.summary.updated).toBe(project.guests.length);
    expect(r.project.guests.every((g) => g.status.e1 === 'declined')).toBe(true);
    expect(r.project.guests[0].firstName).toBe(project.guests[0].firstName);
  });
});

describe('visibility', () => {
  it('hides declined always and pending unless toggled; overrides win', () => {
    const { project } = setup();
    const c = ctxFor(project, 'e1')!;
    const pend = project.guests.find((g) => g.status.e1 === 'pending')!;
    const dec = project.guests.find((g) => g.status.e1 === 'declined')!;
    expect(isVisible(pend, c.event.plan, 'e1')).toBe(false);
    const on = { ...c.event.plan, showPending: true };
    expect(isVisible(pend, on, 'e1')).toBe(true);
    expect(isVisible(dec, on, 'e1')).toBe(false);
    expect(isVisible(dec, { ...on, overrides: { [dec.id]: 'coming' } }, 'e1')).toBe(true);
    expect(isVisible(pend, { ...on, overrides: { [pend.id]: 'removed' } }, 'e1')).toBe(false);
    expect(effectiveStatus(pend, c.event.plan, 'e1')).toBe('pending');
  });
  it('hidden guests do not count or get auto-seated, but keep their table', () => {
    const { project } = setup();
    const pend = project.guests.find((g) => g.status.e1 === 'pending')!;
    const tid = project.events[0].plan.tables[0].id;
    const withSeat: Project = { ...project, events: [{ ...project.events[0], plan: { ...project.events[0].plan, assignments: { [pend.id]: tid } } }] };
    const c = ctxFor(withSeat, 'e1')!;
    expect(visibleGuests(c).some((g) => g.id === pend.id)).toBe(false);
    expect(autoSeat(c).assignments[pend.id]).toBe(tid);
    expect(Object.keys(autoSeat(c).assignments).length).toBe(visibleGuests(c).length + 1);
  });
});

describe('templates', () => {
  it('welcome room reproduces the 10 / 7 / 4 / 4 / 5 / 6 seat pattern', () => {
    const l = welcomeTemplate();
    expect(l.mode).toBe('anchored');
    expect(l.slots.map((s) => s.seats)).toEqual(WELCOME_SEATS);
    const plan = planFromLayout(l);
    expect(plan.tables.slice(9, 15).map((t) => seatsOf(l, plan, t))).toEqual([10, 7, 4, 4, 5, 6]);
  });
  it('reception has 23 free tables', () => {
    const l = receptionTemplate();
    expect(l.mode).toBe('free');
    expect(l.slots.length).toBe(23);
  });
});

describe('auto-seat', () => {
  it('keeps linked parties together, respects capacity and reports misfits', () => {
    const { project } = setup('welcome');
    const c = ctxFor(project, 'e1')!;
    const r = autoSeat(c);
    const plan = c.event.plan;
    const counts: Record<string, number> = {};
    Object.values(r.assignments).forEach((t) => (counts[t] = (counts[t] ?? 0) + 1));
    plan.tables.forEach((t) => expect(counts[t.id] ?? 0).toBeLessThanOrEqual(seatsOf(c.layout, plan, t)));
    // every linked party is at one table
    const byParty = new Map<string, Set<string>>();
    visibleGuests(c).forEach((g) => { if (r.assignments[g.id]) (byParty.get(g.partyId) ?? byParty.set(g.partyId, new Set()).get(g.partyId)!).add(r.assignments[g.id]); });
    byParty.forEach((s) => expect(s.size).toBe(1));
    expect(r.placed + r.notFit.reduce((a, x) => a + x.guestIds.length, 0)).toBe(visibleGuests(c).length);
  });
  it('only uses placed tables and reports what does not fit', () => {
    const { project } = setup('welcome');
    const p = structuredClone(project);
    p.events[0].plan.tables.forEach((t) => (t.slotId = null)); // everything unplaced
    const r = autoSeat(ctxFor(p, 'e1')!);
    expect(r.placed).toBe(0);
    expect(r.notFit.length).toBeGreaterThan(0);
  });
  it('honours keep-apart and seat-together rules', () => {
    const { project } = setup('reception');
    const g = visibleGuests(ctxFor(project, 'e1')!);
    const a = g[0], b = g[g.length - 1], x = g[5], y = g[10];
    const p = structuredClone(project);
    p.events[0].plan.rules = [
      { id: 'r1', type: 'apart', a: { kind: 'guest', id: a.id }, b: { kind: 'guest', id: x.id } },
      { id: 'r2', type: 'together', a: { kind: 'guest', id: b.id }, b: { kind: 'guest', id: y.id } },
    ];
    const r = autoSeat(ctxFor(p, 'e1')!);
    expect(r.assignments[a.id]).not.toBe(r.assignments[x.id]);
    expect(r.assignments[b.id]).toBe(r.assignments[y.id]);
  });
  it('leaves nothing unseated when there is room', () => {
    const { project } = setup('reception');
    const c = ctxFor(project, 'e1')!;
    const r = autoSeat(c);
    expect(r.notFit).toEqual([]);
    const p = structuredClone(project); p.events[0].plan.assignments = r.assignments;
    expect(unseated(ctxFor(p, 'e1')!).length).toBe(0);
  });
});

describe('contrast', () => {
  it('adjusts hard-to-see colours for both themes', () => {
    for (const hex of ['#ffff00', '#111111', '#c2570c']) {
      expect(contrast(adjustForTheme(hex, 'light'), SURFACE.light)).toBeGreaterThanOrEqual(3);
      expect(contrast(adjustForTheme(hex, 'dark'), SURFACE.dark)).toBeGreaterThanOrEqual(3);
    }
  });
});
