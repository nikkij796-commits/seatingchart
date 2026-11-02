import { create } from 'zustand';
import { produce, current, type Draft } from 'immer';
import type { Guest, Layout, Plan, Project, Rule, SeatEvent, Status, Table } from './types';
import { emptyProject } from './lib/sample';
import { idbRepo } from './db';
import { Ctx, clonePlan, ctxFor, freeSpot, isLinked, moveSet, nextTableName, partyMembers, planFromLayout, seatedAt, slotOf, tablePos } from './lib/plan';
import { autoSeat } from './lib/autoseat';
import { ImportOptions, ImportSummary, applyImport } from './lib/importer';
import { PALETTE } from './lib/contrast';
import { blankLayout, instantiateTemplate } from './lib/templates';
import { fileToBackground } from './lib/background';
import { clamp, uid } from './lib/util';

export type Screen = 'events' | 'seating' | 'guests' | 'layouts' | 'editor';
export type Dialog = null | 'import' | 'groups' | 'rules' | 'export' | 'newEvent' | 'project';
export type ThemePref = 'system' | 'light' | 'dark';

interface State {
  ready: boolean;
  project: Project;
  past: Project[];
  future: Project[];
  eventId: string | null;
  screen: Screen;
  editorLayoutId: string | null;
  view: 'list' | 'floor';
  selGuest: string | null;
  selTable: string | null;
  modalTable: string | null;
  spotlight: string | null;
  query: string;
  poolCollapsed: boolean;
  theme: ThemePref;
  toastMsg: string | null;
  saveState: 'saved' | 'saving' | 'error';
  dialog: Dialog;

  init(): Promise<void>;
  set(p: Partial<State>): void;
  toast(msg: string): void;
  undo(): void;
  redo(): void;
  commit(recipe: (d: Draft<Project>) => void): void;
  edit(recipe: (d: Draft<Plan>, c: Ctx) => void): void;
  ctx(): Ctx | null;

  addTable(): void;
  removeTable(id: string): void;
  setTableCount(n: number): void;
  renameTable(id: string, name: string): void;
  setSeatsOverride(id: string, n: number | null): void;
  setDefaultSeats(n: number): void;
  moveGuests(ids: string[], tableId: string | null): void;
  toggleLink(partyId: string): void;
  setShowPending(b: boolean): void;
  setOverride(guestId: string, o: 'coming' | 'removed' | null): void;
  runAutoSeat(): void;
  unseatAll(): void;
  unseatTable(id: string): void;
  placeTable(tableId: string, slotId: string | null): void;
  moveTableFree(tableId: string, x: number, y: number): void;
  resetLayout(): void;
  addRule(r: Omit<Rule, 'id'>): void;
  deleteRule(id: string): void;

  createEvent(name: string, layoutId: string, inviteFrom?: string | null): string;
  duplicateEvent(id: string): void;
  deleteEvent(id: string): void;
  renameEvent(id: string, name: string): void;
  setEventLayout(id: string, layoutId: string): void;

  updateGuest(id: string, patch: Partial<Guest>): void;
  setGuestStatus(id: string, s: Status): void;
  addGuest(g: Partial<Guest>): void;
  deleteGuest(id: string): void;
  addGroup(name: string): string;
  updateGroup(id: string, patch: { name?: string; color?: string }): void;
  deleteGroup(id: string): void;
  importGuests(o: Omit<ImportOptions, 'eventId'>): ImportSummary;
  loadProject(p: Project): void;

  addLayout(kind: 'blank' | 'default'): string;
  addLayoutFromFile(file: File): Promise<string | null>;
  duplicateLayout(id: string): string;
  updateLayout(id: string, fn: (l: Draft<Layout>) => void): void;
  deleteLayout(id: string): void;
}

const THEME_KEY = 'seating-theme', EVENT_KEY = 'seating-event';
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

/** Keep every event on this layout consistent after the layout changed. */
function syncEvents(d: Draft<Project>, layoutId: string) {
  const layout = d.layouts.find((l) => l.id === layoutId);
  if (!layout) return;
  const slotIds = new Set(layout.slots.map((s) => s.id));
  d.events.filter((e) => e.layoutId === layoutId).forEach((e) => {
    const used = new Set<string>();
    e.plan.tables.forEach((t) => {
      if (t.slotId && (!slotIds.has(t.slotId) || (layout.mode === 'anchored' && used.has(t.slotId)))) t.slotId = null;
      if (t.slotId) used.add(t.slotId);
    });
  });
}

export const useStore = create<State>((set, get) => {
  const ctx = () => ctxFor(get().project, get().eventId);
  const commit: State['commit'] = (recipe) =>
    set((s) => {
      const next = produce(s.project, recipe);
      return next === s.project ? s : { project: next, past: [...s.past.slice(-99), s.project], future: [], saveState: 'saving' };
    });
  const edit: State['edit'] = (recipe) =>
    commit((d) => {
      const c = ctxFor(d as Project, get().eventId);
      if (c) recipe(c.event.plan as Draft<Plan>, c as Ctx);
    });
  const toast = (msg: string) => { set({ toastMsg: msg }); clearTimeout((toast as unknown as { h?: number }).h); (toast as unknown as { h?: number }).h = window.setTimeout(() => set({ toastMsg: null }), 3200); };

  function addTableTo(c: Ctx, plan: Draft<Plan>) {
    const t: Table = { id: uid('tbl'), name: nextTableName(plan as Plan), slotId: null, seatsOverride: null };
    if (c.layout.mode === 'anchored') {
      const used = new Set(plan.tables.map((x) => x.slotId));
      t.slotId = c.layout.slots.find((s) => !used.has(s.id))?.id ?? null;
    } else t.pos = freeSpot(c.layout, plan as Plan);
    plan.tables.push(t as Draft<Table>);
  }

  return {
    ready: false,
    project: emptyProject(),
    past: [], future: [],
    eventId: null, screen: 'events', editorLayoutId: null, view: 'list',
    selGuest: null, selTable: null, modalTable: null, spotlight: null, query: '', poolCollapsed: false,
    theme: (lsGet(THEME_KEY) as ThemePref) || 'system', toastMsg: null, saveState: 'saved', dialog: null,

    async init() {
      let p: Project | null = null;
      try { p = await idbRepo.load(); } catch { /* fall through to an empty project */ }
      const project = p ?? emptyProject();
      const saved = lsGet(EVENT_KEY);
      const eventId = project.events.find((e) => e.id === saved)?.id ?? project.events[0]?.id ?? null;
      set({ project, eventId, ready: true, screen: eventId ? 'seating' : 'events' });
    },
    set: (p) => {
      set(p as never);
      if (p.theme) lsSet(THEME_KEY, p.theme);
      if (p.eventId) lsSet(EVENT_KEY, p.eventId);
    },
    toast,
    ctx,
    commit, edit,
    undo() {
      const { past, project, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      const eventId = prev.events.some((e) => e.id === get().eventId) ? get().eventId : prev.events[0]?.id ?? null;
      set({ project: prev, past: past.slice(0, -1), future: [project, ...future], eventId, saveState: 'saving' });
    },
    redo() {
      const { past, project, future } = get();
      if (!future.length) return;
      const [nxt, ...rest] = future;
      const eventId = nxt.events.some((e) => e.id === get().eventId) ? get().eventId : nxt.events[0]?.id ?? null;
      set({ project: nxt, past: [...past, project], future: rest, eventId, saveState: 'saving' });
    },

    addTable() { edit((plan, c) => addTableTo(c, plan)); },
    removeTable(id) {
      edit((plan) => {
        plan.tables = plan.tables.filter((t) => t.id !== id);
        Object.keys(plan.assignments).forEach((g) => { if (plan.assignments[g] === id) delete plan.assignments[g]; });
      });
      if (get().selTable === id) set({ selTable: null });
      if (get().modalTable === id) set({ modalTable: null });
    },
    setTableCount(n) {
      n = clamp(Math.round(n) || 0, 0, 80);
      const cur = ctx()?.event.plan.tables.length ?? 0;
      let moved = 0;
      edit((plan, c) => {
        while (plan.tables.length < n) addTableTo(c, plan);
        if (plan.tables.length > n) {
          const gone = new Set(plan.tables.splice(n).map((t) => t.id));
          Object.keys(plan.assignments).forEach((g) => { if (gone.has(plan.assignments[g])) { delete plan.assignments[g]; moved++; } });
        }
      });
      if (moved) toast(`${moved} guest${moved > 1 ? 's' : ''} moved back to Unseated.`);
      void cur;
    },
    renameTable(id, name) { edit((plan) => { const t = plan.tables.find((x) => x.id === id); if (t) t.name = name.trim() || t.name; }); },
    setSeatsOverride(id, n) { edit((plan) => { const t = plan.tables.find((x) => x.id === id); if (t) t.seatsOverride = n && n > 0 ? Math.min(n, 60) : null; }); },
    setDefaultSeats(n) { edit((plan) => { plan.defaultSeats = clamp(Math.round(n) || 1, 1, 60); }); },
    moveGuests(ids, tableId) {
      edit((plan) => { ids.forEach((g) => { if (tableId == null) delete plan.assignments[g]; else plan.assignments[g] = tableId; }); });
      set({ selGuest: null });
    },
    toggleLink(partyId) {
      const c0 = ctx(); if (!c0) return;
      const linked = isLinked(c0, partyId);
      edit((plan, c) => {
        if (linked) { plan.unlinkedPartyIds.push(partyId); return; }
        plan.unlinkedPartyIds = plan.unlinkedPartyIds.filter((x) => x !== partyId);
        // relinking pulls the visible party back to the table most of them already share
        const counts: Record<string, number> = {};
        partyMembers(c, partyId).forEach((g) => { const t = plan.assignments[g.id]; if (t) counts[t] = (counts[t] ?? 0) + 1; });
        const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        if (best) partyMembers(c, partyId).forEach((g) => (plan.assignments[g.id] = best));
      });
      toast(linked ? 'Party split. Each person can now go to a different table.' : 'Party linked and seated together.');
    },
    setShowPending(b) { edit((plan) => { plan.showPending = b; }); set({ selGuest: null }); },
    setOverride(guestId, o) { edit((plan) => { if (o) plan.overrides[guestId] = o; else delete plan.overrides[guestId]; }); },
    runAutoSeat() {
      const c = ctx(); if (!c) return;
      const r = autoSeat(c);
      edit((plan) => { plan.assignments = r.assignments; });
      const miss = r.notFit.reduce((a, x) => a + x.guestIds.length, 0);
      if (!r.placed && !miss) toast('Everyone already has a seat.');
      else toast(miss ? `Seated ${r.placed}. ${miss} did not fit: ${[...new Set(r.notFit.map((x) => x.reason))].join(' ')}` : `Seated ${r.placed} guests.`);
    },
    unseatAll() { edit((plan) => { plan.assignments = {}; }); toast('Everyone is back in Unseated.'); },
    unseatTable(id) {
      const c = ctx(); if (!c) return;
      const m = seatedAt(c, id);
      edit((plan) => m.forEach((g) => delete plan.assignments[g.id]));
      toast(`${m.length} guests moved back to Unseated.`);
    },
    placeTable(tableId, slotId) {
      let bumped: string | null = null;
      edit((plan) => {
        const t = plan.tables.find((x) => x.id === tableId); if (!t) return;
        if (slotId != null) {
          const o = plan.tables.find((x) => x.id !== tableId && x.slotId === slotId);
          if (o) { o.slotId = null; bumped = o.name; }
        }
        t.slotId = slotId;
      });
      if (bumped) toast(`${bumped} was replaced and moved to Unplaced tables.`);
    },
    moveTableFree(tableId, x, y) { edit((plan) => { const t = plan.tables.find((q) => q.id === tableId); if (t) t.pos = { x: clamp(x, 0.03, 0.97), y: clamp(y, 0.03, 0.97) }; }); },
    resetLayout() {
      edit((plan, c) => {
        if (c.layout.mode === 'anchored') {
          const slots = c.layout.slots;
          plan.tables.forEach((t, i) => { t.slotId = i < slots.length ? slots[i].id : null; });
        } else {
          plan.tables.forEach((t, i) => { const s = c.layout.slots[i]; t.slotId = s?.id ?? null; delete t.pos; });
          plan.tables.filter((t) => !t.slotId).forEach((t) => { t.pos = freeSpot(c.layout, plan as Plan); });
        }
      });
      toast('Tables are back in the venue layout.');
    },
    addRule(r) { edit((plan) => { plan.rules.push({ ...r, id: uid('rule') }); }); },
    deleteRule(id) { edit((plan) => { plan.rules = plan.rules.filter((r) => r.id !== id); }); },

    createEvent(name, layoutId, inviteFrom) {
      const id = uid('evt');
      commit((d) => {
        const layout = d.layouts.find((l) => l.id === layoutId) ?? d.layouts[0];
        d.events.push({ id, name: name.trim() || 'New event', layoutId: layout.id, plan: planFromLayout(layout as Layout) } as Draft<SeatEvent>);
        d.guests.forEach((g) => { g.status[id] = inviteFrom ? g.status[inviteFrom] ?? 'not invited' : 'not invited'; });
      });
      set({ eventId: id, screen: 'seating' }); lsSet(EVENT_KEY, id);
      return id;
    },
    duplicateEvent(id) {
      const nid = uid('evt');
      commit((d) => {
        const e = d.events.find((x) => x.id === id); if (!e) return;
        // fresh table ids; guests keep their ids, so assignments map across
        d.events.push({ id: nid, name: e.name + ' (copy)', layoutId: e.layoutId, plan: clonePlan(current(e.plan) as Plan) } as Draft<SeatEvent>);
        d.guests.forEach((g) => { g.status[nid] = g.status[id] ?? 'not invited'; });
      });
      set({ eventId: nid }); lsSet(EVENT_KEY, nid);
      toast('Event duplicated with its seating plan.');
    },
    deleteEvent(id) {
      commit((d) => { d.events = d.events.filter((e) => e.id !== id); d.guests.forEach((g) => { delete g.status[id]; }); });
      if (get().eventId === id) { const e = get().project.events[0]; set({ eventId: e?.id ?? null, screen: e ? get().screen : 'events' }); }
    },
    renameEvent(id, name) { commit((d) => { const e = d.events.find((x) => x.id === id); if (e && name.trim()) e.name = name.trim(); }); },
    setEventLayout(id, layoutId) {
      commit((d) => {
        const e = d.events.find((x) => x.id === id), layout = d.layouts.find((l) => l.id === layoutId); if (!e || !layout) return;
        e.layoutId = layoutId;
        const plan = e.plan, slots = layout.slots;
        plan.tables.forEach((t, i) => { t.slotId = slots[i]?.id ?? null; delete t.pos; });
        slots.slice(plan.tables.length).forEach((s, k) => plan.tables.push({ id: uid('tbl'), name: s.label ? `Table ${s.label}` : `Table ${plan.tables.length + k + 1}`, slotId: s.id, seatsOverride: null }));
        if (layout.mode === 'free') plan.tables.filter((t) => !t.slotId).forEach((t) => { t.pos = freeSpot(layout as Layout, plan as Plan); });
      });
    },

    updateGuest(id, patch) { commit((d) => { const g = d.guests.find((x) => x.id === id); if (g) Object.assign(g, patch); }); },
    setGuestStatus(id, s) { const e = get().eventId; if (e) commit((d) => { const g = d.guests.find((x) => x.id === id); if (g) g.status[e] = s; }); },
    addGuest(g) {
      const e = get().eventId;
      commit((d) => {
        const partyId = g.partyId ?? uid('party');
        if (!d.parties.some((p) => p.id === partyId)) d.parties.push({ id: partyId, label: '', linked: true });
        d.guests.push({ id: uid('g'), firstName: '', lastName: '', partyId, groupId: null, dietary: '', notes: '', status: e ? { [e]: 'confirmed' } : {}, ...g } as Draft<Guest>);
      });
    },
    deleteGuest(id) {
      commit((d) => {
        d.guests = d.guests.filter((g) => g.id !== id);
        d.parties = d.parties.filter((p) => d.guests.some((g) => g.partyId === p.id));
        d.events.forEach((e) => { delete e.plan.assignments[id]; delete e.plan.overrides[id]; e.plan.rules = e.plan.rules.filter((r) => !(r.a.kind === 'guest' && r.a.id === id) && !(r.b.kind === 'guest' && r.b.id === id)); });
      });
    },
    addGroup(name) {
      const id = uid('grp');
      commit((d) => { d.groups.push({ id, name: name.trim() || 'Group', color: PALETTE[d.groups.length % PALETTE.length] }); });
      return id;
    },
    updateGroup(id, patch) { commit((d) => { const g = d.groups.find((x) => x.id === id); if (g) Object.assign(g, patch); }); },
    deleteGroup(id) { commit((d) => { d.groups = d.groups.filter((g) => g.id !== id); d.guests.forEach((g) => { if (g.groupId === id) g.groupId = null; }); }); },
    importGuests(o) {
      const eventId = get().eventId!;
      const res = applyImport(get().project, { ...o, eventId });
      set((s) => ({ project: res.project, past: [...s.past.slice(-99), s.project], future: [], saveState: 'saving' }));
      return res.summary;
    },
    loadProject(p) {
      const eventId = p.events[0]?.id ?? null;
      set((s) => ({ project: p, past: [...s.past.slice(-99), s.project], future: [], eventId, screen: eventId ? 'seating' : 'events', saveState: 'saving' }));
    },

    addLayout(kind) {
      const l = instantiateTemplate(kind);
      commit((d) => { d.layouts.push(l as Draft<Layout>); });
      return l.id;
    },
    async addLayoutFromFile(file) {
      try {
        const bg = await fileToBackground(file);
        const l = { ...blankLayout(file.name.replace(/\.[^.]+$/, '') || 'My room'), ratio: bg.ratio, background: { dataUrl: bg.dataUrl, opacity: 0.6 } };
        commit((d) => { d.layouts.push(l as Draft<Layout>); });
        return l.id;
      } catch { toast('Could not read that image or PDF.'); return null; }
    },
    duplicateLayout(id) {
      const nid = uid('layout');
      commit((d) => {
        const l = d.layouts.find((x) => x.id === id); if (!l) return;
        const copy = structuredClone(current(l) as Layout);
        copy.id = nid; copy.name += ' (copy)'; delete copy.templateId;
        copy.slots = copy.slots.map((s) => ({ ...s, id: uid('slot') }));
        copy.shapes = copy.shapes.map((s) => ({ ...s, id: uid('shp') }));
        d.layouts.push(copy as Draft<Layout>);
      });
      return nid;
    },
    updateLayout(id, fn) { commit((d) => { const l = d.layouts.find((x) => x.id === id); if (l) { fn(l); syncEvents(d, id); } }); },
    deleteLayout(id) {
      const used = get().project.events.some((e) => e.layoutId === id);
      if (used) { toast('This layout is used by an event. Switch that event to another layout first.'); return; }
      commit((d) => { d.layouts = d.layouts.filter((l) => l.id !== id); });
    },
  };
});

// derived: unused import guards for tree-shaking friendliness
void slotOf; void tablePos; void moveSet;

/* ---------- autosave ---------- */
let saveTimer: number | undefined;
let lastSaved: Project | null = null;
useStore.subscribe((s) => {
  if (!s.ready || s.project === lastSaved) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const p = useStore.getState().project;
    try { await idbRepo.save(p); lastSaved = p; useStore.setState({ saveState: 'saved' }); }
    catch { useStore.setState({ saveState: 'error' }); }
  }, 400);
});
