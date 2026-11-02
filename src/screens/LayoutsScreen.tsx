import { useStore } from '../store';
import type { Layout } from '../types';
import { UploadLayoutButton } from '../components/UploadLayout';

export function MiniLayout({ l }: { l: Layout }) {
  return (
    <div className="minilayout" style={{ ['--ratio' as string]: l.ratio }}>
      {l.background && <img src={l.background.dataUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: l.background.opacity }} />}
      {l.slots.map((s) => <i key={s.id} style={{ ['--x' as string]: s.x, ['--y' as string]: s.y, ['--w' as string]: s.w, ['--h' as string]: s.shape === 'round' ? s.w : s.h }} />)}
    </div>
  );
}

export function LayoutsScreen() {
  const project = useStore((s) => s.project);
  const st = useStore.getState();
  const open = (id: string) => st.set({ editorLayoutId: id, screen: 'editor' });
  return (
    <div className="page">
      <div className="row">
        <h2 style={{ flex: 1 }}>Room layouts</h2>
        <UploadLayoutButton label="Upload a floor plan" />
        <button className="btn" onClick={() => open(st.addLayout('default'))}>Add a default room</button>
        <button className="btn" onClick={() => open(st.addLayout('blank'))}>New empty layout</button>
      </div>
      <span className="hint">Layouts are reusable across events. Upload a floor-plan image or PDF, or start from the Default room (a square room with round tables), then adjust tables in the editor.</span>
      <div className="cards" id="layoutCards">
        {project.layouts.map((l) => {
          const used = project.events.filter((e) => e.layoutId === l.id);
          return (
            <div key={l.id} className="card2" data-layout={l.id}>
              <MiniLayout l={l} />
              <b>{l.name}</b>
              <div className="hint">{l.mode === 'anchored' ? 'Anchored' : 'Free'} · {l.slots.length} table spots · used by {used.length} event{used.length === 1 ? '' : 's'}</div>
              <div className="row">
                <button className="btn" onClick={() => open(l.id)}>Edit</button>
                <button className="btn" onClick={() => open(st.duplicateLayout(l.id))}>Duplicate</button>
                <button className="btn danger" onClick={() => st.deleteLayout(l.id)} disabled={used.length > 0} title={used.length ? 'In use by an event' : ''}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
