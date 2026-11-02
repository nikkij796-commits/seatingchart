export type Status = 'confirmed' | 'pending' | 'declined' | 'not invited';
export const STATUSES: Status[] = ['confirmed', 'pending', 'declined', 'not invited'];

export interface Group { id: string; name: string; color: string }
export interface Party { id: string; label: string; linked: boolean }
export interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  partyId: string;
  groupId: string | null;
  dietary: string;
  notes: string;
  /** RSVP status per event id. Missing = not invited. */
  status: Record<string, Status>;
  /** Optional id from the imported file, used to match later imports. */
  externalId?: string;
}

export type SlotShape = 'round' | 'rectangle' | 'curved';
export interface Slot {
  id: string;
  /** centre, fractions of the layout (0..1) */
  x: number;
  y: number;
  shape: SlotShape;
  seats: number;
  label?: string;
  /** size in percent of layout width (container-relative, keeps aspect ratio) */
  w: number;
  h: number;
  /** degrees */
  rotation: number;
}

export interface FixedShape {
  id: string;
  kind: 'wall' | 'door' | 'zone' | 'label';
  /** wall/door: polyline points as fractions */
  points?: [number, number][];
  closed?: boolean;
  /** zone: top-left + size as fractions; label: centre in x,y */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  round?: boolean;
  text?: string;
}

export interface Layout {
  id: string;
  name: string;
  /** width / height */
  ratio: number;
  mode: 'free' | 'anchored';
  shapes: FixedShape[];
  slots: Slot[];
  background?: { dataUrl: string; opacity: number };
  /** real-world width of the layout in metres, if a scale was set */
  widthMeters?: number;
  templateId?: string;
}

export interface Table {
  id: string;
  name: string;
  slotId: string | null;
  seatsOverride: number | null;
  /** free mode: current position as fractions; falls back to the slot position */
  pos?: { x: number; y: number };
}

export type RuleRef = { kind: 'guest' | 'party'; id: string };
export interface Rule { id: string; type: 'together' | 'apart'; a: RuleRef; b: RuleRef }

export interface Plan {
  tables: Table[];
  assignments: Record<string, string>;
  showPending: boolean;
  unlinkedPartyIds: string[];
  defaultSeats: number;
  /** manual per-guest overrides for this event */
  overrides: Record<string, 'coming' | 'removed'>;
  rules: Rule[];
}

export interface SeatEvent { id: string; name: string; layoutId: string; plan: Plan }

export interface Project {
  version: 1;
  guests: Guest[];
  parties: Party[];
  groups: Group[];
  layouts: Layout[];
  events: SeatEvent[];
}
