import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/guests.csv');

/** Open the side menu if it is a drawer (phone), then click a section. */
export async function openMenu(page: Page) {
  const m = page.getByRole('button', { name: 'Open menu' });
  if ((await m.isVisible()) && !(await page.locator('.shell.nav-open').count())) await m.click();
}
export async function nav(page: Page, name: 'Events' | 'Seating' | 'Guests' | 'Layouts') {
  await openMenu(page);
  await page.locator('#sidenav').getByRole('button', { name, exact: true }).click();
}

export async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => { localStorage.clear(); await new Promise<void>((r) => { const q = indexedDB.deleteDatabase('seating-app'); q.onsuccess = q.onerror = q.onblocked = () => r(); }); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /first event/i })).toBeVisible();
}

export async function createEvent(page: Page, name: string, layout: string, invite?: string) {
  if (!(await page.getByRole('heading', { name: /first event|New event/ }).isVisible())) await nav(page, 'Events');
  await page.getByLabel('Event name').first().fill(name);
  await page.getByLabel('Room layout').selectOption({ label: layout });
  if (invite) await page.getByLabel('Invite guests').selectOption({ label: invite });
  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page.locator('.tab[role=tab]', { hasText: name })).toBeVisible();
}

export async function importFixture(page: Page) {
  await nav(page, 'Guests');
  await page.locator('#importBtn').click();
  await page.locator('#importFile').setInputFiles(FIXTURE);
  await expect(page.locator('#mapping')).toBeVisible();
  await page.locator('#doImport').click();
  await expect(page.locator('#importSummary')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await nav(page, 'Seating');
}

export const chip = (page: Page, name: string) => page.locator('[data-guest]').filter({ hasText: name });
export const tableCard = (page: Page, i: number) => page.locator('.table').nth(i);
