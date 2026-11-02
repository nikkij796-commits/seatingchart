import { useEffect } from 'react';
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

const NAV: [Screen, string][] = [['events', 'Events'], ['seating', 'Seating'], ['guests', 'Guests'], ['layouts', 'Layouts']];

export function App() {
  const ready = useStore((s) => s.ready);
  const screen = useStore((s) => s.screen);
  const toast = useStore((s) => s.toastMsg);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const theme = useStore((s) => s.theme);
  const hasEvents = useStore((s) => s.project.events.length > 0);
  useTheme();
  useEffect(() => { void useStore.getState().init(); }, []);
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
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  if (!ready) return <div className="app"><span className="spin" aria-label="Loading" /></div>;
  const st = useStore.getState();
  const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  return (
    <div className="app">
      <div className="nav">
        <h1>Seating Chart</h1>
        <nav className="navtabs" aria-label="Sections">
          {NAV.map(([k, label]) => (
            <button key={k} className="tab" aria-selected={screen === k || (k === 'layouts' && screen === 'editor')} disabled={!hasEvents && k === 'seating'} onClick={() => st.set({ screen: k })}>{label}</button>
          ))}
        </nav>
        <span className="sp" />
        <button className="btn" onClick={() => st.undo()} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">↶ Undo</button>
        <button className="btn" onClick={() => st.redo()} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷ Redo</button>
        <button className="btn" onClick={() => st.set({ dialog: 'project' })}>Project</button>
        <button className="btn" onClick={() => st.set({ theme: nextTheme })} title="Switch theme" aria-label={`Theme: ${theme}. Switch to ${nextTheme}`}>Theme: {theme}</button>
      </div>
      {screen === 'events' && <EventsScreen />}
      {screen === 'seating' && <SeatingScreen />}
      {screen === 'guests' && <GuestsScreen />}
      {screen === 'layouts' && <LayoutsScreen />}
      {screen === 'editor' && <LayoutEditor />}
      <Dialogs />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
