import { useRef, useState } from 'react';
import { useStore } from '../store';

/** Upload a floor-plan image or PDF as a new room layout and open it in the editor. */
export function UploadLayoutButton({ label = 'Upload my own floor plan' }: { label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input ref={ref} type="file" accept="image/*,application/pdf" hidden aria-label="Upload floor plan file" data-upload-layout
        onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          setBusy(true);
          const id = await useStore.getState().addLayoutFromFile(f);
          setBusy(false);
          if (id) useStore.getState().set({ editorLayoutId: id, screen: 'editor' });
        }} />
      <button type="button" className="btn" disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Reading file…' : label}</button>
    </>
  );
}
