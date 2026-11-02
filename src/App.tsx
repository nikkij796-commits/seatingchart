import { useEffect, useRef, useState } from 'react';
import { useStore, type Screen } from './store';
import { adjustForTheme } from './lib/contrast';
import { SeatingScreen } from './screens/SeatingScreen';
import { EventsScreen } from './screens/EventsScreen';
import { GuestsScreen } from './screens/GuestsScreen';
import { LayoutsScreen } from './screens/LayoutsScreen';
import { LayoutEditor } from './screens/LayoutEditor';
import { Dialogs } from './components/Dialogs';

function useTheme() {
  const theme = useStore((s) => s.theme);
  const groups = useStore((s) => s.project.groups);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      if (theme === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = theme;
      groups.forEach((g) => root.style.setProperty(`--g-${g.id}`, adjustForTheme(g.color, dark ? 'dark' : 'light')));
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, groups]);
}

const ICONS: Record<string, string> = {
  events: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4',
  seating: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M2 12h2 M20 12h2',
  guests: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21c0-4 3-6 8-6s8 2 8 6',
  layouts: 'M3 3h18v18H3z M3 9h18 M9 9v12',
  project: 'M4 4h12l4 4v12H4z M8 4v5h8 M8 20v-6h8v6',
  theme: 'M12 3a9 9 0 1 0 0 18z',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  collapse: 'M15 6l-6 6 6 6',
  expand: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12 M18 6L6 18',
};
export const Icon = ({ n }: { n: keyof typeof ICONS }) => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[n]} /></svg>
);

const NAV: [Screen, string][] = [['events', 'Events'], ['seating', 'Seating'], ['guests', 'Guests'], ['layouts', 'Layouts']];
const LS_COLLAPSED = 'seating-nav-collapsed';

export function App() {
  const ready = useStore((s) => s.ready);
  const screen = useStore((s) => s.screen);
  const toast = useStore((s) => s.toastMsg);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const theme = useStore((s) => s.theme);
  const events = useStore((s) => s.project.events);
  const eventId = useStore((s) => s.eventId);
  const [open, setOpen] = useState(false); // phone drawer
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(LS_COLLAPSED) === '1'; } catch { return false; } });
  const menuBtn = useRef<HTMLButtonElement>(null);
  const firstNav = useRef<HTMLButtonElement>(null);
  useTheme();
  useEffect(() => { void useStore.getState().init(); }, []);
  useEffect(() => { try { localStorage.setItem(LS_COLLAPSED, collapsed ? '1' : '0'); } catch { /* ignore */ } }, [collapsed]);
  useEffect(() => { if (open) firstNav.current?.focus(); }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      const typing = (e.target as HTMLElement)?.closest?.('input,textarea,select');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? st.redo() : st.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); st.redo(); return; }
      if (e.key !== 'Escape') return;
      if (st.dialog) st.set({ dialog: null });
      else if (st.modalTable) st.set({ modalTable: null });
      else if (st.selGuest) st.set({ selGuest: null });
      else if (st.selTable) st.set({ selTable: null });
      else setOpen((o) => { if (o) menuBtn.current?.focus(); return false; });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  if (!ready) return <div className="app"><span className="spin" aria-label="Loading" /></div>;
  const st = useStore.getState();
  const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  const hasEvents = events.length > 0;
  const evName = events.find((e) => e.id === eventId)?.name;
  const go = (k: Screen) => { st.set({ screen: k }); setOpen(false); };
  const title = screen === 'editor' ? 'Layout editor' : NAV.find(([k]) => k === screen)?.[1];
  return (
    <div className={`shell${collapsed ? ' nav-collapsed' : ''}${open ? ' nav-open' : ''}`}>
      <aside className="side" id="sidenav" aria-label="Main menu">
        <div className="side-head">
          <span className="brand">Seating Chart</span>
          <button className="icon-btn side-close" onClick={() => { setOpen(false); menuBtn.current?.focus(); }} aria-label="Close menu"><Icon n="close" /></button>
        </div>
        {evName && <button className="side-event" onClick={() => go('events')} title="Switch or manage events"><small>Event</small><b>{evName}</b></button>}
        <nav className="side-nav" aria-label="Sections">
          {NAV.map(([k, label], i) => (
            <button key={k} ref={i === 0 ? firstNav : undefined} className="nav-item" aria-label={label} title={label}
              aria-current={screen === k || (k === 'layouts' && screen === 'editor') ? 'page' : undefined}
              disabled={!hasEvents && k === 'seating'} onClick={() => go(k)}>
              <Icon n={k} /><span className="lbl-txt">{label}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <button className="nav-item" aria-label="Project" title="Project: export, import, erase" onClick={() => { st.set({ dialog: 'project' }); setOpen(false); }}><Icon n="project" /><span className="lbl-txt">Project</span></button>
          <button className="nav-item" aria-label={`Theme: ${theme}. Switch to ${nextTheme}`} title="Switch theme" onClick={() => st.set({ theme: nextTheme })}><Icon n="theme" /><span className="lbl-txt">Theme: {theme}</span></button>
          <button className="nav-item side-collapse" aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} aria-expanded={!collapsed} title={collapsed ? 'Expand menu' : 'Collapse menu'} onClick={() => setCollapsed((c) => !c)}><Icon n={collapsed ? 'expand' : 'collapse'} /><span className="lbl-txt">Collapse</span></button>
        </div>
      </aside>
      <div className="backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="app">
        <header className="topbar">
          <button ref={menuBtn} className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="sidenav"><Icon n="menu" /></button>
          <h1>{title}{screen === 'seating' && evName ? <span className="crumb"> · {evName}</span> : null}</h1>
          <span className="sp" />
          <button className="btn" onClick={() => st.undo()} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">↶<span className="hide-sm"> Undo</span></button>
          <button className="btn" onClick={() => st.redo()} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷<span className="hide-sm"> Redo</span></button>
        </header>
        {screen === 'events' && <EventsScreen />}
        {screen === 'seating' && <SeatingScreen />}
        {screen === 'guests' && <GuestsScreen />}
        {screen === 'layouts' && <LayoutsScreen />}
        {screen === 'editor' && <LayoutEditor />}
      </div>
      <Dialogs />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
