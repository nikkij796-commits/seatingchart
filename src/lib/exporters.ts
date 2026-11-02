import { jsPDF } from 'jspdf';
import type { Guest } from '../types';
import { Ctx, groupName, guestName, partyLabel, seatedAt, seatsOf, slotOf, tableBox, tablePos, unseated, visibleGuests, isPlaced } from './plan';
import { toCsv } from './util';

const latin = (s: string) => s.replace(/[^\x20-\xFF]/g, '?');

export function tableNumber(c: Ctx, tableId: string) {
  return c.event.plan.tables.findIndex((t) => t.id === tableId) + 1;
}
const tableName = (c: Ctx, tableId: string | undefined) => c.event.plan.tables.find((t) => t.id === tableId)?.name ?? '';

export function assignmentRows(c: Ctx): string[][] {
  const rows = [['Table', 'Guest', 'Group', 'Party', 'Dietary', 'Notes']];
  c.event.plan.tables.forEach((t) =>
    seatedAt(c, t.id).forEach((g) => rows.push([t.name, guestName(g), groupName(c.project, g.groupId), partyLabel(c, c.project.parties.find((p) => p.id === g.partyId), g.partyId), g.dietary, g.notes])),
  );
  unseated(c).forEach((g) => rows.push(['Unseated', guestName(g), groupName(c.project, g.groupId), partyLabel(c, c.project.parties.find((p) => p.id === g.partyId), g.partyId), g.dietary, g.notes]));
  return rows;
}
export const assignmentCsv = (c: Ctx) => toCsv(assignmentRows(c));

export interface EscortEntry { guest: Guest; name: string; tableName: string; tableNo: number | null }
/** Alphabetical by last, then first name. Duplicates stay distinct because rows are per guest id. */
export function escortList(c: Ctx): EscortEntry[] {
  return visibleGuests(c)
    .map((g) => {
      const tid = c.event.plan.assignments[g.id];
      const t = c.event.plan.tables.find((x) => x.id === tid);
      return { guest: g, name: `${g.lastName}, ${g.firstName}`.replace(/^, |, $/g, ''), tableName: t?.name ?? '', tableNo: t ? tableNumber(c, t.id) : null };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.guest.id.localeCompare(b.guest.id));
}
export const escortCsv = (c: Ctx) => toCsv([['Guest', 'Table number', 'Table'], ...escortList(c).map((e) => [e.name, e.tableNo ?? '', e.tableName])]);

export interface DietaryRow { dietary: string; count: number; guests: { name: string; table: string }[] }
export function dietarySummary(c: Ctx): DietaryRow[] {
  const map = new Map<string, DietaryRow>();
  visibleGuests(c).forEach((g) => {
    const d = g.dietary.trim();
    if (!d) return;
    const key = d.toLowerCase();
    const row = map.get(key) ?? { dietary: d, count: 0, guests: [] };
    row.count++;
    row.guests.push({ name: guestName(g), table: tableName(c, c.event.plan.assignments[g.id]) || 'Unseated' });
    map.set(key, row);
  });
  return [...map.values()].sort((a, b) => b.count - a.count || a.dietary.localeCompare(b.dietary));
}
export const dietaryCsv = (c: Ctx) => toCsv([['Dietary', 'Guest', 'Table'], ...dietarySummary(c).flatMap((r) => r.guests.map((g) => [r.dietary, g.name, g.table]))]);

/* ---------- PDF ---------- */
function listPdf(title: string, sections: { heading: string; lines: string[] }[], opts: { columns?: number; pageBreakPerSection?: boolean } = {}): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48;
  const cols = opts.columns ?? 1, colW = (W - 2 * M) / cols;
  let y = M, col = 0;
  doc.setFont('helvetica', 'bold').setFontSize(18).text(latin(title), M, y);
  y += 28;
  const top = y;
  const next = () => { col++; y = top; if (col >= cols) { doc.addPage(); col = 0; y = M; } };
  sections.forEach((s, si) => {
    if (opts.pageBreakPerSection && si > 0) { doc.addPage(); y = M; col = 0; }
    if (y + 34 > H - M) next();
    doc.setFont('helvetica', 'bold').setFontSize(12).text(latin(s.heading), M + col * colW, y);
    y += 16;
    doc.setFont('helvetica', 'normal').setFontSize(10.5);
    s.lines.forEach((l) => {
      if (y + 14 > H - M) next();
      doc.text(latin(l), M + col * colW + 6, y, { maxWidth: colW - 12 });
      y += 14;
    });
    y += 10;
  });
  return doc.output('blob');
}

export const escortPdf = (c: Ctx) =>
  listPdf(`${c.event.name}: find your table`, [{ heading: 'Guests A-Z', lines: escortList(c).map((e) => `${e.name}   -   ${e.tableNo ? `${e.tableName} (${e.tableNo})` : 'not seated'}`) }], { columns: 2 });

export const tableListsPdf = (c: Ctx) =>
  listPdf(`${c.event.name}: guest lists by table`, [
    ...c.event.plan.tables.filter((t) => isPlaced(c.layout, t)).map((t) => {
      const m = seatedAt(c, t.id);
      return { heading: `${t.name} (${m.length}/${seatsOf(c.layout, c.event.plan, t)})`, lines: m.length ? m.map((g) => guestName(g) + (g.dietary ? `  [${g.dietary}]` : '')) : ['(empty)'] };
    }),
    ...(unseated(c).length ? [{ heading: `Unseated (${unseated(c).length})`, lines: unseated(c).map(guestName) }] : []),
  ], { columns: 2 });

export const dietaryPdf = (c: Ctx) => {
  const rows = dietarySummary(c);
  return listPdf(`${c.event.name}: dietary summary`, rows.length ? rows.map((r) => ({ heading: `${r.dietary} (${r.count})`, lines: r.guests.map((g) => `${g.name}   -   ${g.table}`) })) : [{ heading: 'No dietary needs recorded', lines: [] }]);
};

/** Floor plan as a vector PDF, light theme colours. */
export function floorPlanPdf(c: Ctx): Blob {
  const { layout } = c, plan = c.event.plan;
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: layout.ratio >= 1 ? 'landscape' : 'portrait' });
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 36, head = 30;
  const aw = PW - 2 * M, ah = PH - 2 * M - head;
  const w = Math.min(aw, ah * layout.ratio), h = w / layout.ratio;
  const ox = M + (aw - w) / 2, oy = M + head;
  doc.setFont('helvetica', 'bold').setFontSize(15).text(latin(`${c.event.name} - ${layout.name}`), M, M + 12);
  doc.setDrawColor(200).setLineWidth(0.6).rect(ox, oy, w, h);
  if (layout.background) {
    try { doc.addImage(layout.background.dataUrl, 'PNG', ox, oy, w, h); } catch { /* unsupported image: skip */ }
  }
  const P = (x: number, y: number): [number, number] => [ox + x * w, oy + y * h];
  layout.shapes.forEach((s) => {
    if ((s.kind === 'wall' || s.kind === 'door') && s.points) {
      doc.setDrawColor(s.kind === 'wall' ? 90 : 140).setLineWidth(s.kind === 'wall' ? 1.6 : 1);
      const pts = s.points.map(([x, y]) => P(x, y));
      pts.forEach((p, i) => { const q = pts[i + 1] ?? (s.closed ? pts[0] : null); if (q) doc.line(p[0], p[1], q[0], q[1]); });
    } else if (s.kind === 'zone') {
      doc.setFillColor(238, 238, 238).setDrawColor(190).setLineWidth(0.8);
      const [x, y] = P(s.x ?? 0, s.y ?? 0), zw = (s.w ?? 0) * w, zh = (s.h ?? 0) * h;
      if (s.round) doc.ellipse(x + zw / 2, y + zh / 2, zw / 2, zh / 2, 'FD'); else doc.rect(x, y, zw, zh, 'FD');
    } else if (s.kind === 'label' && s.text) {
      const [x, y] = P(s.x ?? 0, s.y ?? 0);
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(110).text(latin(s.text), x, y, { align: 'center' }).setTextColor(0);
    }
  });
  plan.tables.filter((t) => isPlaced(layout, t)).forEach((t) => {
    const pos = tablePos(layout, t);
    if (!pos) return;
    const box = tableBox(layout, plan, t);
    const [cx, cy] = P(pos.x, pos.y), tw = (box.w / 100) * w, th = (box.h / 100) * w;
    const m = seatedAt(c, t.id), cap = seatsOf(layout, plan, t);
    doc.setFillColor(255, 255, 255).setDrawColor(m.length > cap ? 200 : 90, m.length > cap ? 30 : 90, m.length > cap ? 30 : 90).setLineWidth(1);
    if (box.shape === 'round') doc.ellipse(cx, cy, tw / 2, th / 2, 'FD'); else doc.roundedRect(cx - tw / 2, cy - th / 2, tw, th, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold').setFontSize(Math.max(6, tw / 6)).setTextColor(0).text(latin(t.name), cx, cy - 1, { align: 'center', maxWidth: tw - 4 });
    doc.setFont('helvetica', 'normal').setFontSize(Math.max(6, tw / 7)).text(`${m.length}/${cap}`, cx, cy + tw / 6 + 2, { align: 'center' });
  });
  void slotOf;
  return doc.output('blob');
}
