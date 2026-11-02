import Papa from 'papaparse';
import { produce } from 'immer';
import type { Guest, Party, Project, Status } from '../types';
import { PALETTE } from './contrast';
import { uid } from './util';

export interface Sheet { headers: string[]; rows: string[][] }

export interface Mapping {
  fullName: number | null;
  firstName: number | null;
  lastName: number | null;
  party: number | null;
  group: number | null;
  dietary: number | null;
  notes: number | null;
  rsvp: number | null;
  externalId: number | null;
}
export const EMPTY_MAPPING: Mapping = { fullName: null, firstName: null, lastName: null, party: null, group: null, dietary: null, notes: null, rsvp: null, externalId: null };

export function parseCsv(text: string): Sheet {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  const data = (res.data as string[][]).map((r) => r.map((c) => String(c ?? '').trim()));
  const [headers = [], ...rows] = data;
  return { headers: headers.map((h, i) => h || `Column ${i + 1}`), rows };
}

export async function parseXlsx(buf: ArrayBuffer): Promise<Sheet> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = (XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' }) as unknown[][]).map((r) => r.map((c) => String(c ?? '').trim()));
  const [headers = [], ...rows] = data;
  return { headers: headers.map((h, i) => h || `Column ${i + 1}`), rows };
}

export async function parseFile(file: File): Promise<Sheet> {
  if (/\.xlsx?$/i.test(file.name)) return parseXlsx(await file.arrayBuffer());
  return parseCsv(await file.text());
}

const find = (headers: string[], re: RegExp) => { const i = headers.findIndex((h) => re.test(h)); return i < 0 ? null : i; };
export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {
    firstName: find(headers, /^(first|given)[ _-]*name$|^first$/i),
    lastName: find(headers, /^(last|sur|family)[ _-]*name$|^last$|^surname$/i),
    fullName: find(headers, /^(full[ _-]*)?(guest[ _-]*)?name$|^guest$/i),
    party: find(headers, /party|household|family|group size|invitation|invite/i),
    group: find(headers, /^(group|host|side|category|list)$|host|side/i),
    dietary: find(headers, /diet|meal|allerg|food/i),
    notes: find(headers, /note|comment|memo/i),
    rsvp: find(headers, /rsvp|status|attend|response|reply/i),
    externalId: find(headers, /^(guest[ _-]*)?id$|^ref/i),
  };
  if (m.firstName != null && m.lastName != null) m.fullName = m.fullName === m.firstName || m.fullName === m.lastName ? null : m.fullName;
  if (m.fullName == null && m.firstName == null) m.fullName = headers.length ? 0 : null;
  return m;
}

export function guessStatus(raw: string): Status {
  const v = raw.trim().toLowerCase();
  if (!v) return 'pending';
  if (/^(not|no\b|decline|regret|cannot|can't|unable)/.test(v) || /not attend|declin|regret/.test(v)) return 'declined';
  if (/not invited|n\/a|no invite/.test(v)) return 'not invited';
  if (/^(y|yes|attend|accept|confirm|coming|going|will attend|rsvp(ed)?\b)/.test(v) || /attending|accepted|confirmed/.test(v)) return 'confirmed';
  return 'pending';
}

export function rsvpValues(sheet: Sheet, col: number | null): string[] {
  if (col == null) return [];
  return [...new Set(sheet.rows.map((r) => (r[col] ?? '').trim()))].sort((a, b) => a.localeCompare(b));
}
export function defaultStatusMap(sheet: Sheet, col: number | null): Record<string, Status> {
  return Object.fromEntries(rsvpValues(sheet, col).map((v) => [v, guessStatus(v)]));
}

export function splitName(full: string): [string, string] {
  const s = full.trim().replace(/\s+/g, ' ');
  if (s.includes(',')) { const [l, ...f] = s.split(','); return [f.join(',').trim(), l.trim()]; }
  const parts = s.split(' ');
  if (parts.length === 1) return [parts[0], ''];
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]];
}

export type ImportMode = 'new' | 'update-by-id' | 'update-by-row';
export interface ImportOptions {
  sheet: Sheet;
  mapping: Mapping;
  statusMap: Record<string, Status>;
  eventId: string;
  mode: ImportMode;
}
export interface ImportSummary { added: number; updated: number; skipped: number; groupsCreated: number; byStatus: Record<Status, number> }

const cell = (r: string[], i: number | null) => (i == null ? '' : (r[i] ?? '').trim());

function rowName(r: string[], m: Mapping): [string, string] {
  if (m.firstName != null || m.lastName != null) {
    const f = cell(r, m.firstName), l = cell(r, m.lastName);
    if (f || l) return [f, l];
  }
  return splitName(cell(r, m.fullName));
}

/** Pure: returns the new project and a summary. Never matches on names. */
export function applyImport(project: Project, o: ImportOptions): { project: Project; summary: ImportSummary } {
  const summary: ImportSummary = { added: 0, updated: 0, skipped: 0, groupsCreated: 0, byStatus: { confirmed: 0, pending: 0, declined: 0, 'not invited': 0 } };
  const next = produce(project, (d) => {
    const { sheet, mapping: m, statusMap, eventId } = o;
    const statusFor = (r: string[]): Status => (m.rsvp == null ? 'confirmed' : statusMap[cell(r, m.rsvp)] ?? guessStatus(cell(r, m.rsvp)));
    const groupByName = new Map(d.groups.map((g) => [g.name.trim().toLowerCase(), g.id]));
    const groupFor = (name: string): string | null => {
      if (!name) return null;
      const k = name.toLowerCase();
      let id = groupByName.get(k);
      if (!id) {
        id = uid('grp');
        d.groups.push({ id, name, color: PALETTE[d.groups.length % PALETTE.length] });
        groupByName.set(k, id);
        summary.groupsCreated++;
      }
      return id;
    };

    if (o.mode === 'new') {
      const partyByKey = new Map<string, string>();
      sheet.rows.forEach((r) => {
        const [first, last] = rowName(r, m);
        if (!first && !last) { summary.skipped++; return; }
        const pkey = cell(r, m.party).toLowerCase();
        let partyId = pkey ? partyByKey.get(pkey) : undefined;
        if (!partyId) {
          partyId = uid('party');
          const party: Party = { id: partyId, label: pkey ? cell(r, m.party) : '', linked: true };
          d.parties.push(party);
          if (pkey) partyByKey.set(pkey, partyId);
        }
        const status = statusFor(r);
        const g: Guest = {
          id: uid('g'), firstName: first, lastName: last, partyId, groupId: groupFor(cell(r, m.group)),
          dietary: cell(r, m.dietary), notes: cell(r, m.notes), status: { [eventId]: status },
          externalId: cell(r, m.externalId) || undefined,
        };
        d.guests.push(g);
        summary.added++;
        summary.byStatus[status]++;
      });
    } else {
      const byExt = new Map(d.guests.filter((g) => g.externalId).map((g) => [g.externalId!, g]));
      sheet.rows.forEach((r, i) => {
        const g = o.mode === 'update-by-id' ? byExt.get(cell(r, m.externalId)) : d.guests[i];
        if (!g) { summary.skipped++; return; }
        const status = statusFor(r);
        g.status[eventId] = status;
        if (m.dietary != null && cell(r, m.dietary)) g.dietary = cell(r, m.dietary);
        if (m.notes != null && cell(r, m.notes)) g.notes = cell(r, m.notes);
        if (m.group != null && cell(r, m.group)) g.groupId = groupFor(cell(r, m.group));
        summary.updated++;
        summary.byStatus[status]++;
      });
    }
    // the importing event now knows these guests; other events keep their own statuses
  });
  return { project: next, summary };
}
