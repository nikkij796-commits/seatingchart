import type { Layout, Slot } from '../types';
import { uid } from './util';

/** The built-in "Default" room: a square room with 12 round tables of 10. */
export function defaultLayout(): Layout {
  const slots: Slot[] = [];
  const xs = [0.2, 0.4, 0.6, 0.8], ys = [0.25, 0.5, 0.75];
  ys.forEach((y, r) => xs.forEach((x, c) => {
    slots.push({ id: uid('slot'), x, y, shape: 'round', seats: 10, w: 14, h: 14, rotation: 0, label: String(r * xs.length + c + 1) });
  }));
  return {
    id: uid('layout'), name: 'Default', ratio: 1, mode: 'free', templateId: 'default', slots,
    shapes: [{ id: uid('shp'), kind: 'wall', closed: true, points: [[0.03, 0.03], [0.97, 0.03], [0.97, 0.97], [0.03, 0.97]] }],
  };
}

export function blankLayout(name = 'My room', mode: 'free' | 'anchored' = 'free', ratio = 1.5): Layout {
  return { id: uid('layout'), name, ratio, mode, shapes: [], slots: [] };
}

export function instantiateTemplate(id: 'default' | 'blank'): Layout {
  return id === 'default' ? defaultLayout() : blankLayout();
}
