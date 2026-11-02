import { expect, test } from '@playwright/test';
import { chip, createEvent, nav, openMenu, fresh, importFixture, tableCard } from './helpers';

test.beforeEach(async ({ page }) => { await fresh(page); });

test('import a CSV with column mapping, RSVP mapping and duplicate names', async ({ page }) => {
  await createEvent(page, 'Reception', 'Default');
  await nav(page, 'Guests');
  await page.locator('#importBtn').click();
  await page.locator('#importFile').setInputFiles('tests/fixtures/guests.csv');
  // columns were auto-detected, RSVP values mapped by meaning
  await expect(page.getByLabel('Name (full)')).toHaveValue('0');
  await expect(page.getByLabel('RSVP value Attending')).toHaveValue('confirmed');
  await expect(page.getByLabel('RSVP value Not Attending')).toHaveValue('declined');
  await expect(page.getByLabel('RSVP value blank')).toHaveValue('pending');
  await page.getByLabel('Group / host').selectOption({ label: 'Side' });
  await page.locator('#doImport').click();
  await expect(page.locator('#importSummary')).toContainText('Added 7 guests');
  await expect(page.locator('#importSummary')).toContainText('4 confirmed, 2 pending, 1 declined');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-guest-row]')).toHaveCount(7);
  await expect(page.locator('[data-guest-row] input[aria-label="First name"]').evaluateAll((els) => els.filter((e) => (e as HTMLInputElement).value === 'Cy').length)).resolves.toBe(2);
  // seating screen: declined never shown, pending hidden by default
  await nav(page, 'Seating');
  await expect(page.locator('#poolTitle')).toHaveText('Unseated (4)');
  await expect(chip(page, 'Fay Ash')).toHaveCount(0);
  await expect(chip(page, 'Dee Pine')).toHaveCount(0);
  await expect(chip(page, 'Cy Oak')).toHaveCount(2);
});

test('link and unlink a party', async ({ page }) => {
  await createEvent(page, 'Reception', 'Default');
  await importFixture(page);
  // tap Ada, tap table 1: the linked party moves together
  await chip(page, 'Ada Fern').click();
  await expect(page.locator('#selbar')).toBeVisible();
  await tableCard(page, 0).locator('.tbody').click();
  await expect(tableCard(page, 0).locator('[data-guest]')).toHaveCount(2);
  // unlink, then move Ben alone
  await tableCard(page, 0).locator('[data-link]').click();
  await expect(tableCard(page, 0).locator('.grp.broken')).toHaveCount(1);
  await chip(page, 'Ben Fern').click();
  await tableCard(page, 1).locator('.tbody').click();
  await expect(tableCard(page, 0).locator('[data-guest]')).toHaveCount(1);
  await expect(tableCard(page, 1).locator('[data-guest]')).toHaveCount(1);
  // relink pulls the party back together
  await page.locator('.table [data-link]').first().click();
  const t0 = await tableCard(page, 0).locator('[data-guest]').count();
  const t1 = await tableCard(page, 1).locator('[data-guest]').count();
  expect([t0, t1].sort()).toEqual([0, 2]);
});

test('pending toggle restores positions', async ({ page }) => {
  await createEvent(page, 'Reception', 'Default');
  await importFixture(page);
  await page.locator('#showPend').check();
  await expect(chip(page, 'Dee Pine')).toBeVisible();
  await expect(chip(page, 'Dee Pine')).toHaveClass(/pend/);
  await expect(page.locator('#poolList')).toContainText('no RSVP');
  await chip(page, 'Dee Pine').click();
  await tableCard(page, 2).locator('.tbody').click();
  await expect(tableCard(page, 2)).toContainText('Dee Pine');
  await expect(tableCard(page, 2)).toContainText('Eli Pine'); // linked party moved as one
  const seatedBefore = await page.locator('#stats').innerText();
  await page.locator('#showPend').uncheck();
  await expect(page.locator('[data-guest]').filter({ hasText: 'Dee Pine' })).toHaveCount(0);
  await expect(page.locator('#pendNote')).toContainText('hidden guest');
  expect(await page.locator('#stats').innerText()).not.toBe(seatedBefore);
  await page.locator('#showPend').check();
  await expect(tableCard(page, 2)).toContainText('Dee Pine');
});

test('event switching never changes another event plan', async ({ page }) => {
  await createEvent(page, 'Reception', 'Default');
  await importFixture(page);
  await chip(page, 'Cy Oak').first().click();
  await tableCard(page, 0).locator('.tbody').click();
  await expect(tableCard(page, 0)).toContainText('Cy Oak');
  await createEvent(page, 'Dinner', 'Default', 'same guests as Reception');
  await expect(page.locator('#poolTitle')).toHaveText('Unseated (4)');
  await expect(tableCard(page, 0).locator('[data-guest]')).toHaveCount(0);
  await chip(page, 'Ada Fern').click();
  await tableCard(page, 1).locator('.tbody').click();
  await page.locator('.tab[role=tab]', { hasText: 'Reception' }).click();
  await expect(tableCard(page, 0)).toContainText('Cy Oak');
  await expect(tableCard(page, 1).locator('[data-guest]')).toHaveCount(0);
  await expect(page.locator('#poolTitle')).toHaveText('Unseated (3)');
  // duplicate an event: plan is copied, then independent
  await nav(page, 'Events');
  await page.locator('[data-event]').first().getByRole('button', { name: 'Duplicate plan' }).click();
  await expect(page.locator('[data-event]')).toHaveCount(3);
  await page.locator('[data-event]').filter({ has: page.locator('input[value$="(copy)"]') }).getByRole('button', { name: 'Open' }).click();
  await expect(tableCard(page, 0)).toContainText('Cy Oak');
});

test('state survives a reload (autosave) and undo/redo work', async ({ page }) => {
  await createEvent(page, 'Reception', 'Default');
  await importFixture(page);
  await page.locator('#auto').click();
  await expect(page.locator('#poolTitle')).toHaveText('Unseated (0)');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#poolTitle')).toHaveText('Unseated (4)');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('#poolTitle')).toHaveText('Unseated (0)');
  await expect(page.locator('.saved')).toHaveText('Saved');
  await page.reload();
  await expect(page.locator('#poolTitle')).toHaveText('Unseated (0)');
});

test('layout editor: upload a floor plan, add tables, use in an event', async ({ page }) => {
  await nav(page, 'Layouts');
  await page.getByRole('button', { name: 'New empty layout' }).click();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#eee" stroke="#333"/></svg>';
  await page.locator('#bgFile').setInputFiles({ name: 'plan.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await expect(page.locator('#editorStage img.bg')).toBeVisible();
  await page.getByLabel('Layout name').fill('My hall');
  await page.getByLabel('Layout name').blur();
  await page.locator('[data-tool=table]').click();
  const box = (await page.locator('#editorStage').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.4);
  await expect(page.locator('.ed-slot')).toHaveCount(2);
  await page.getByLabel('Spot seats').fill('8');
  await page.getByLabel('Spot seats').blur();
  await page.getByLabel('Spot shape').selectOption('rectangle');
  await page.getByRole('button', { name: 'Mirror' }).click();
  await expect(page.locator('.ed-slot')).toHaveCount(3);
  await page.getByLabel('Layout mode').selectOption('anchored');
  await page.getByRole('button', { name: '← Layouts' }).click();
  await nav(page, 'Events');
  await page.getByLabel('Event name').first().fill('Gala');
  await page.getByLabel('Room layout').selectOption({ label: 'My hall' });
  await page.getByRole('button', { name: 'Create event' }).click();
  await page.locator('#tabFloor').click();
  await expect(page.locator('#stage .node')).toHaveCount(3);
  await expect(page.locator('#stage img.bg')).toBeVisible();
});

test('table modal closes with button, Esc and outside click', async ({ page }) => {
  await createEvent(page, 'Reception', 'Default');
  const open = async () => { await tableCard(page, 0).locator('.thead').dblclick({ position: { x: 4, y: 4 } }); await expect(page.locator('#modal')).toBeVisible(); };
  await open(); await page.getByRole('button', { name: 'Exit' }).last().click(); await expect(page.locator('#modal')).toHaveCount(0);
  await open(); await page.keyboard.press('Escape'); await expect(page.locator('#modal')).toHaveCount(0);
  await open(); await page.locator('#modal').click({ position: { x: 3, y: 3 } }); await expect(page.locator('#modal')).toHaveCount(0);
});

test('anchored snapping, replacement to the tray, unplace by dragging @desktop', async ({ page }) => {
  // make the Default room anchored, then use it in an event
  await nav(page, 'Layouts');
  await page.locator('[data-layout]').first().getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Layout mode').selectOption('anchored');
  await page.getByRole('button', { name: '← Layouts' }).click();
  await createEvent(page, 'Dinner', 'Default');
  await page.locator('#tabFloor').click();
  await expect(page.locator('#stage .node')).toHaveCount(12);
  await expect(page.locator('#tray')).toContainText('Unplaced tables (0)');
  const stats = page.locator('#stats');
  await expect(stats).toContainText('120 seats');
  const node = (n: number) => page.locator(`#stage .node[aria-label^="Table ${n},"]`);
  const centre = async (loc: ReturnType<typeof node>) => { const b = (await loc.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // drag table 1 onto table 2's spot: table 2 is replaced and goes to the tray
  const a = await centre(node(1)), b = await centre(node(2));
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await expect(page.locator('.slot.hot')).toHaveCount(1); // target slot is highlighted
  await page.mouse.up();
  await expect(page.locator('#tray')).toContainText('Unplaced tables (1)');
  await expect(page.locator('#tray .node')).toContainText('Table 2');
  await expect(page.locator('#stage .node')).toHaveCount(11);
  const afterSwap = await centre(node(1));
  expect(Math.abs(afterSwap.x - b.x)).toBeLessThan(3); // snapped exactly onto the slot
  await expect(stats).toContainText('110 seats'); // unplaced tables do not count
  // drag a table onto the tray: unplaces it
  const c3 = await centre(node(3)); const tray = (await page.locator('#tray').boundingBox())!;
  await page.mouse.move(c3.x, c3.y); await page.mouse.down();
  await page.mouse.move(tray.x + tray.width / 2, tray.y + tray.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('#tray')).toContainText('Unplaced tables (2)');
  // drag from the tray back to the free spot Table 1 left
  const tn = (await page.locator('#tray .node[aria-label^="Table 3,"]').boundingBox())!;
  await page.mouse.move(tn.x + tn.width / 2, tn.y + tn.height / 2); await page.mouse.down();
  await page.mouse.move(a.x, a.y, { steps: 12 }); await page.mouse.up();
  await expect(page.locator('#tray')).toContainText('Unplaced tables (1)');
});

test('upload your own floor plan from the Events screen', async ({ page }) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#eee"/></svg>';
  await page.locator('[data-upload-layout]').setInputFiles({ name: 'My Venue.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await expect(page.locator('#editorStage img.bg')).toBeVisible();
  await expect(page.getByLabel('Layout name')).toHaveValue('My Venue');
});

test('free mode: drag moves a table smoothly and keeps it', async ({ page }) => {
  await createEvent(page, 'Reception', 'Default');
  await page.locator('#tabFloor').click();
  const n = page.locator('#stage .node').first();
  await n.scrollIntoViewIfNeeded();
  const b0 = (await n.boundingBox())!;
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2); await page.mouse.down();
  await page.mouse.move(b0.x + b0.width / 2 + 60, b0.y + b0.height / 2 + 40, { steps: 6 }); await page.mouse.up();
  const b1 = (await n.boundingBox())!;
  expect(Math.round(b1.x - b0.x)).toBeGreaterThan(50);
  await page.getByRole('button', { name: 'Reset layout' }).click();
  const b2 = (await n.boundingBox())!;
  expect(Math.abs(b2.x - b0.x)).toBeLessThan(2);
});

test('themes: dark theme applies and layout has no horizontal overflow', async ({ page }) => {
  await createEvent(page, 'Reception', 'Default');
  await openMenu(page);
  await page.locator('#sidenav').getByRole('button', { name: /^Theme/ }).click();
  await page.locator('#sidenav').getByRole('button', { name: /^Theme/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
});

test('side menu: collapses on desktop, opens as a drawer on phone, Esc closes', async ({ page }, info) => {
  await createEvent(page, 'Reception', 'Default');
  if (info.project.name === 'phone') {
    await expect(page.locator('#sidenav')).toBeHidden();
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.locator('#sidenav')).toBeVisible();
    await expect(page.locator('#sidenav').getByRole('button', { name: 'Seating', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Escape');
    await expect(page.locator('#sidenav')).toBeHidden();
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.locator('.backdrop').click({ position: { x: 360, y: 400 } });
    await expect(page.locator('#sidenav')).toBeHidden();
    await nav(page, 'Guests');
    await expect(page.locator('#sidenav')).toBeHidden(); // closes after choosing
    await expect(page.getByRole('heading', { name: 'Guests', level: 1 })).toBeVisible();
  } else {
    const w = async () => (await page.locator('#sidenav').boundingBox())!.width;
    expect(await w()).toBeGreaterThan(200);
    await page.getByRole('button', { name: 'Collapse menu' }).click();
    await expect.poll(w).toBeLessThan(80);
    await page.reload();
    await expect.poll(w).toBeLessThan(80); // remembered
    await page.getByRole('button', { name: 'Expand menu' }).click();
    await expect.poll(w).toBeGreaterThan(200);
  }
});
