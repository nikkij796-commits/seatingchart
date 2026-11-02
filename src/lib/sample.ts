import type { Project } from '../types';
import { instantiateTemplate } from './templates';

/** Fictional guests only. Includes two people sharing a name to exercise id-based matching. */
const FIRST = ['Avery', 'Jordan', 'Riley', 'Morgan', 'Casey', 'Taylor', 'Quinn', 'Rowan', 'Sage', 'Drew', 'Emery', 'Finley'];
const LAST = ['Alder', 'Birch', 'Cedar', 'Dunmore', 'Elm', 'Fairweather', 'Garrow', 'Holloway', 'Ives', 'Juniper'];

export function sampleRows(): string[][] {
  const rows: string[][] = [['Guest ID', 'Name', 'Household', 'Side', 'Dietary', 'RSVP']];
  const sides = ['Side A', 'Side B', 'Friends', 'Work'];
  const diets = ['', '', '', 'Vegetarian', 'Vegan', 'Gluten free', 'Nut allergy'];
  const rsvp = ['Attending', 'Attending', 'Attending', 'Attending', '', 'Not Attending'];
  let n = 0;
  for (let h = 0; h < 14; h++) {
    const last = LAST[h % LAST.length];
    const size = 1 + ((h * 7) % 4);
    for (let k = 0; k < size; k++) {
      const first = h === 3 && k === 0 ? 'Jordan' : h === 9 && k === 0 ? 'Jordan' : FIRST[(h + k * 5) % FIRST.length];
      const lastName = h === 3 && k === 0 ? 'Elm' : h === 9 && k === 0 ? 'Elm' : last;
      rows.push([`G${String(++n).padStart(3, '0')}`, `${first} ${lastName}`, `${last} household ${h + 1}`, sides[h % sides.length], diets[(h + k) % diets.length], rsvp[(h + k) % rsvp.length]]);
    }
  }
  return rows;
}

export function sampleCsv() {
  return sampleRows().map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
}

export function emptyProject(): Project {
  return {
    version: 1,
    guests: [], parties: [], groups: [],
    layouts: [instantiateTemplate('blank'), instantiateTemplate('reception'), instantiateTemplate('welcome')],
    events: [],
  };
}
