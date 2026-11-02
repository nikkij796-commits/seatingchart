import type { FixedShape, Layout, Slot } from '../types';
import { uid } from './util';

/* Geometry only (walls, zones, table spots). The two rooms come from the original prototype. */

const RECEPTION_VB = { x: 60, y: 90, w: 1220, h: 960 };
const rf = ([x, y]: [number, number]): [number, number] => [(x - RECEPTION_VB.x) / RECEPTION_VB.w, (y - RECEPTION_VB.y) / RECEPTION_VB.h];

const RECEPTION_SPOTS: [number, number][] = [[250,275],[425,255],[898,277],[1088,277],[222,452],[388,425],[925,452],[1109,452],[447,580],[278,627],[897,597],[1088,610],[222,797],[408,745],[591,758],[774,727],[947,745],[1109,757],[370,911],[573,911],[750,892],[925,911],[1122,911]];

function shapeId() { return uid('shp'); }

export function receptionTemplate(): Layout {
  const ratio = RECEPTION_VB.w / RECEPTION_VB.h;
  const wall: [number, number][] = [[125,181],[538,181],[538,97],[591,97],[591,181],[714,181],[714,97],[803,97],[803,181],[1207,181],[1207,987],[980,987],[980,1045],[890,1045],[890,987],[420,987],[420,1045],[333,1045],[333,987],[125,987],[125,708],[75,708],[75,663],[125,663],[125,485],[118,485],[118,395],[125,395]];
  const doors: [number, number][][] = [
    [[538,97],[538,152],[591,150]], [[803,97],[803,150],[760,150]],
    [[1207,395],[1260,395],[1260,485],[1207,485]], [[1207,770],[1260,770],[1260,860],[1207,860]],
    [[125,663],[75,663],[75,708],[125,708]],
    [[333,1045],[333,1000]], [[420,1045],[420,1000]], [[890,1045],[890,1000]], [[980,1045],[980,1000]],
  ];
  const zoneRect = (x: number, y: number, w: number, h: number, extra: Partial<FixedShape> = {}): FixedShape => {
    const [fx, fy] = rf([x, y]);
    return { id: shapeId(), kind: 'zone', x: fx, y: fy, w: w / RECEPTION_VB.w, h: h / RECEPTION_VB.h, ...extra };
  };
  const shapes: FixedShape[] = [
    { id: shapeId(), kind: 'wall', points: wall.map(rf), closed: true },
    ...doors.map((d): FixedShape => ({ id: shapeId(), kind: 'door', points: d.map(rf) })),
    zoneRect(570, 181, 183, 150), zoneRect(545, 331, 243, 244),
    zoneRect(615, 607, 76, 76, { round: true }),
    { id: shapeId(), kind: 'label', x: 0.493, y: 0.179, text: 'STAGE' },
    { id: shapeId(), kind: 'label', x: 0.498, y: 0.469, text: 'DANCE FLOOR' },
  ];
  const slots: Slot[] = RECEPTION_SPOTS.map((p, i) => {
    const [x, y] = rf(p);
    return { id: uid('slot'), x, y, shape: 'round', seats: 10, w: 11.2, h: 11.2, rotation: 0, label: String(i + 1) };
  });
  return { id: 'layout_tpl_reception', name: 'Reception hall (free tables)', ratio, mode: 'free', shapes, slots, templateId: 'reception' };
}

const WELCOME_SPOTS: [number, number][] = [[168,105],[291,105],[88,155],[371,157],[168,205],[291,205],[88,260],[364,260],[168,316],[283,316],[99,365],[99,410],[78,445],[92,490],[99,538],[375,367],[376,413],[355,449],[369,494],[375,540]];
/** 10 x 10-seat tables, then 7 / 4 / 4 / 5 / 6 / 7 / 4 / 4 / 5 / 6 */
export const WELCOME_SEATS = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 7, 4, 4, 5, 6, 7, 4, 4, 5, 6];

export function welcomeTemplate(): Layout {
  const W = 442, H = 630;
  const f = ([x, y]: [number, number]): [number, number] => [x / W, y / H];
  const wall: [number, number][] = [[12,10],[176,10],[176,0],[293,0],[293,10],[430,10],[430,604],[12,604],[12,485],[0,485],[0,455],[12,455]];
  const shapes: FixedShape[] = [
    { id: shapeId(), kind: 'wall', points: wall.map(f), closed: true },
    { id: shapeId(), kind: 'zone', x: 153 / W, y: 386 / H, w: 154 / W, h: 184 / H },
    { id: shapeId(), kind: 'zone', x: 200 / W, y: 572 / H, w: 47 / W, h: 30 / H },
    { id: shapeId(), kind: 'zone', x: 0.514 - 0.062, y: 0.759 - 0.062 * (W / H), w: 0.124, h: 0.124 * (W / H), round: true },
    { id: shapeId(), kind: 'label', x: 0.529, y: 0.094, text: 'EVENT AREA' },
    { id: shapeId(), kind: 'label', x: 0.52, y: 0.874, text: 'DANCE FLOOR' },
    { id: shapeId(), kind: 'label', x: 0.504, y: 0.932, text: 'DJ' },
  ];
  const slots: Slot[] = WELCOME_SPOTS.map((p, i) => {
    const [x, y] = f(p);
    const d = +Math.min(11.6, 7.4 + WELCOME_SEATS[i] * 0.42).toFixed(1); // smaller tables for fewer seats
    return { id: uid('slot'), x, y, shape: 'round', seats: WELCOME_SEATS[i], w: d, h: d, rotation: 0, label: String(i + 1) };
  });
  return { id: 'layout_tpl_welcome', name: 'Welcome dinner (anchored)', ratio: W / H, mode: 'anchored', shapes, slots, templateId: 'welcome' };
}

export function blankLayout(name = 'Blank room', mode: 'free' | 'anchored' = 'free', ratio = 1.5): Layout {
  return { id: uid('layout'), name, ratio, mode, shapes: [], slots: [] };
}

export function instantiateTemplate(id: 'reception' | 'welcome' | 'blank'): Layout {
  const l = id === 'reception' ? receptionTemplate() : id === 'welcome' ? welcomeTemplate() : blankLayout();
  return { ...l, id: uid('layout') };
}
