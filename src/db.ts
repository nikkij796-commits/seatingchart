import { openDB } from 'idb';
import type { Project } from './types';

/** Storage seam: swap this for a cloud implementation later without touching the UI. */
export interface ProjectRepo {
  load(): Promise<Project | null>;
  save(p: Project): Promise<void>;
}

const DB = 'seating-app';
const db = () => openDB(DB, 1, { upgrade(d) { d.createObjectStore('kv'); } });

export const idbRepo: ProjectRepo = {
  async load() { return ((await (await db()).get('kv', 'project')) as Project | undefined) ?? null; },
  async save(p) { await (await db()).put('kv', JSON.parse(JSON.stringify(p)), 'project'); },
};
