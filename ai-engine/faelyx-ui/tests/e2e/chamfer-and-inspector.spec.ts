import { expect, test, type Page } from '@playwright/test';
import { click, esc, input, lineCoords, openSketch, tool, toScreen } from './helpers';

// Editing a chamfer changes only that chamfer (its cuts slide along the
// parent lines; the rest of the sketch keeps every dimension), and every
// Sketch Toolbox pick drives the Sketch Inspector's tool card, both ways.

test.beforeEach(async ({ page }) => { await openSketch(page); });

// 40 x 20 rectangle: corners (200,150) (240,150) (240,130) (200,130) on screen.
async function typedRect(page: Page) {
  await tool(page, 'Rectangle');
  await input(page, 'Corner H (mm)').fill('0'); await input(page, 'V (mm)').fill('0');
  await input(page, 'Width').fill('40'); await input(page, 'Height').fill('20'); await input(page, 'Height').press('Enter');
  await esc(page);
  await page.waitForTimeout(500);
}
// Chamfer the bottom-right corner (240,150): bottom edge first, then the right edge.
async function chamferCorner(page: Page, mode: 'Two lengths' | 'Length + angle', a: string, bOrAngle: string) {
  await tool(page, 'Chamfer');
  await page.locator('.viewport-hint .anchor-toggle button', { hasText: mode }).click();
  if (mode === 'Two lengths') { await input(page, 'Distance A (mm)').fill(a); await input(page, 'Distance B (mm)').fill(bOrAngle); }
  else { await input(page, 'First length (mm)').fill(a); await input(page, 'Angle (°)').fill(bOrAngle); }
  await click(page, 220, 150); await click(page, 240, 140);
  await esc(page);
  await page.waitForTimeout(500);
}
const round = (ls: number[][]) => ls.map((l) => l.map((n) => Math.round(n * 1000) / 1000));
// The sketch's other lines (everything but the chamfer), as endpoint sets.
async function parents(page: Page) {
  const all = round(await lineCoords(page));
  return all.slice(0, -1);
}
async function chamferLine(page: Page) { return round(await lineCoords(page)).at(-1)!; }
async function selectChamfer(page: Page) {
  const [x1, y1, x2, y2] = await chamferLine(page);
  await click(page, (x1 + x2) / 2, (y1 + y2) / 2);
}
const chamferField = (page: Page, label: string) =>
  page.locator('[data-chamfer] .property-input', { hasText: label }).locator('input');
const hasSegment = (ls: number[][], a: [number, number], b: [number, number]) =>
  ls.some(([x1, y1, x2, y2]) => (Math.abs(x1 - a[0]) < 1e-3 && Math.abs(y1 - a[1]) < 1e-3 && Math.abs(x2 - b[0]) < 1e-3 && Math.abs(y2 - b[1]) < 1e-3)
    || (Math.abs(x1 - b[0]) < 1e-3 && Math.abs(y1 - b[1]) < 1e-3 && Math.abs(x2 - a[0]) < 1e-3 && Math.abs(y2 - a[1]) < 1e-3));

test('two-length chamfer: editing A and B moves only its cuts along the parent lines', async ({ page }) => {
  await typedRect(page);
  await chamferCorner(page, 'Two lengths', '8', '8');
  const before = await parents(page);
  expect(hasSegment(before, [200, 150], [232, 150])).toBe(true);
  expect(hasSegment(before, [240, 142], [240, 130])).toBe(true);

  await selectChamfer(page);
  await expect(chamferField(page, 'Distance A')).toHaveValue('8.00');
  await chamferField(page, 'Distance A').fill('12'); await chamferField(page, 'Distance A').press('Enter');
  await expect.poll(async () => hasSegment(await parents(page), [200, 150], [228, 150])).toBe(true);
  let now = await parents(page);
  expect(hasSegment(now, [240, 142], [240, 130])).toBe(true);        // B untouched
  expect(hasSegment(now, [240, 130], [200, 130])).toBe(true);        // top edge untouched
  expect(hasSegment(now, [200, 130], [200, 150])).toBe(true);        // left edge untouched

  await chamferField(page, 'Distance B').fill('10'); await chamferField(page, 'Distance B').press('Enter');
  await expect.poll(async () => hasSegment(await parents(page), [240, 140], [240, 130])).toBe(true);
  now = await parents(page);
  expect(hasSegment(now, [200, 150], [228, 150])).toBe(true);        // A untouched
  expect(hasSegment(now, [240, 130], [200, 130])).toBe(true);
  expect(hasSegment(now, [200, 130], [200, 150])).toBe(true);
  expect(await chamferLine(page)).toEqual(expect.arrayContaining([228, 150]));
});

test('editing a chamfer\'s length scales only the chamfer (angle kept, polygon untouched)', async ({ page }) => {
  await typedRect(page);
  await chamferCorner(page, 'Length + angle', '10', '30');
  // cut 1 at (230,150); 30° up to the right edge: (240, 150 - 10·tan30).
  const h = 10 * Math.tan(Math.PI / 6);
  const len0 = Math.hypot(10, h);
  await selectChamfer(page);
  // Double the chamfer through the Inspector's plain Length field.
  const length = page.locator('[data-edit-group] .property-input', { hasText: /^Length/ }).locator('input');
  await length.fill(String(2 * len0)); await length.press('Enter');
  await expect.poll(async () => hasSegment(await parents(page), [200, 150], [220, 150])).toBe(true);
  const now = await parents(page);
  expect(hasSegment(now, [240, 150 - 2 * h], [240, 130])).toBe(true);      // same 30° chamfer, twice the size
  expect(hasSegment(now, [240, 130], [200, 130])).toBe(true);
  expect(hasSegment(now, [200, 130], [200, 150])).toBe(true);
  const [x1, y1, x2, y2] = await chamferLine(page);
  expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(2 * len0, 3);
});

test('double-clicking the chamfer\'s own dimension edits just the chamfer; Ctrl+Z restores it', async ({ page }) => {
  await typedRect(page);
  await chamferCorner(page, 'Two lengths', '8', '8');
  await selectChamfer(page);
  const label = page.locator('svg.sketch-svg text.dim-label', { hasText: /^11\.31$/ }).first();
  const box = (await label.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  const editor = page.locator('svg.sketch-svg input.dim-edit-input');
  await editor.fill(String(2 * Math.hypot(8, 8))); await editor.press('Enter');
  await expect.poll(async () => hasSegment(await parents(page), [200, 150], [224, 150])).toBe(true);
  const now = await parents(page);
  expect(hasSegment(now, [240, 134], [240, 130])).toBe(true);
  expect(hasSegment(now, [240, 130], [200, 130])).toBe(true);
  await page.waitForTimeout(500);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => hasSegment(await parents(page), [200, 150], [232, 150])).toBe(true);
});

test('changing a two-length chamfer\'s angle keeps A and moves only B', async ({ page }) => {
  await typedRect(page);
  await chamferCorner(page, 'Two lengths', '8', '8');
  await selectChamfer(page);
  await chamferField(page, 'Chamfer angle').fill('30'); await chamferField(page, 'Chamfer angle').press('Enter');
  const b = 8 * Math.tan(Math.PI / 6);
  await expect.poll(async () => hasSegment(await parents(page), [240, 150 - b], [240, 130])).toBe(true);
  expect(hasSegment(await parents(page), [200, 150], [232, 150])).toBe(true);
});

// ---------------------------------------------------------------- Inspector
const card = (page: Page) => page.locator('.tool-card');
const cardField = (page: Page, label: string | RegExp) => card(page).locator('.property-input', { hasText: label }).locator('input');

test('every Sketch Toolbox pick switches the Inspector to that tool, in the standard layout', async ({ page }) => {
  page.on('filechooser', () => {});                       // AI Import opens the file picker
  const names = await page.locator('.toolbox-panel .tool-item > span:nth-child(2)').evaluateAll((spans) =>
    spans.map((s) => s.textContent?.trim() ?? '').filter(Boolean));
  const unique = [...new Set(names)];
  expect(unique.length).toBeGreaterThan(25);
  for (const name of unique) {
    await page.locator('.toolbox-panel .tool-item').filter({ has: page.locator(`span:text-is("${name}")`) }).first().click();
    await page.waitForTimeout(40);
    await expect(card(page).locator('.tool-card-head strong'), name).toHaveText(name);
    for (const section of ['status', 'parameters', 'references']) await expect(card(page).locator(`[data-section="${section}"]`)).toBeVisible();
    await expect(card(page).locator('.tool-card-instruction')).not.toBeEmpty();
    await esc(page, 2);
  }
});

test('tool parameters are shared both ways: Inspector ↔ bottom bar ↔ canvas', async ({ page }) => {
  await tool(page, 'Rectangle');
  await cardField(page, /^Width/).fill('30');
  await expect(input(page, 'Width')).toHaveValue('30');               // Inspector → bottom bar
  await input(page, 'Height').fill('12');
  await expect(cardField(page, /^Height/)).toHaveValue('12');        // bottom bar → Inspector
  await cardField(page, /^Corner H/).fill('0'); await cardField(page, /^Corner V/).fill('0');
  await card(page).getByRole('button', { name: 'Add rectangle' }).click();
  await expect(page.locator('svg.sketch-svg line.sketch-line')).toHaveCount(4); // Inspector → canvas
  expect(hasSegment(round(await lineCoords(page)), [200, 150], [230, 150])).toBe(true);

  await tool(page, 'Fillet');
  await cardField(page, /Fillet radius/).fill('3');
  await expect(input(page, 'Radius (mm)')).toHaveValue('3');

  await tool(page, 'Chamfer');
  await card(page).locator('.tool-card-toggle button', { hasText: 'Two lengths' }).click();
  await expect(page.locator('.viewport-hint .anchor-toggle button.anchor-active', { hasText: 'Two lengths' })).toBeVisible();
  await cardField(page, /Chamfer distance A/).fill('4'); await cardField(page, /Chamfer distance B/).fill('6');
  await expect(input(page, 'Distance A (mm)')).toHaveValue('4');
  await click(page, 215, 150); await click(page, 230, 140);          // apply on the canvas with those values
  // Canvas → Inspector: the new chamfer is listed; picking it opens its own parameters.
  const chip = card(page).locator('[data-section="references"] .relations-row', { hasText: 'Chamfers' }).locator('button').first();
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.locator('[data-chamfer] .property-input', { hasText: 'Distance A' }).locator('input')).toHaveValue('4.00');
  await expect(page.locator('[data-chamfer] .property-input', { hasText: 'Distance B' }).locator('input')).toHaveValue('6.00');
});

test('a line in progress shows its live length in the Inspector; typing there places it', async ({ page }) => {
  await tool(page, 'Line');
  await click(page, 150, 150);
  const length = cardField(page, /^Length/);
  await expect(length).toBeVisible();
  await expect(card(page).locator('[data-section="references"]')).toContainText(/Start: Point/);   // the placed start point
  const p = await toScreen(page, 180, 150);
  await page.mouse.move(p.x, p.y);
  await expect.poll(async () => Number(await length.inputValue())).toBeGreaterThan(20);  // follows the cursor
  await cardField(page, /^Angle/).fill('0');
  await length.fill('25'); await length.press('Enter');
  await expect.poll(async () => round(await lineCoords(page)).some(([x1, y1, x2, y2]) => Math.abs(Math.hypot(x2 - x1, y2 - y1) - 25) < 1e-3)).toBe(true);
});

test('a constraint pick opens its value in the Inspector and applies from there', async ({ page }) => {
  await tool(page, 'Point');
  await click(page, 150, 150); await click(page, 190, 150);
  await esc(page);
  await click(page, 150, 150);
  const b = await toScreen(page, 190, 150);
  await page.keyboard.down('Shift'); await page.mouse.click(b.x, b.y); await page.keyboard.up('Shift');
  await page.locator('.toolbox-panel .tool-item').filter({ has: page.locator('span:text-is("Distance")') }).first().click();
  await expect(card(page).locator('.tool-card-head strong')).toHaveText('Distance');
  await expect(card(page).locator('[data-section="references"]')).toContainText('Point');
  const value = cardField(page, /^Distance/);
  await value.fill('25');
  await card(page).getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(async () => {
    const pts = await page.$$eval('svg.sketch-svg .sketch-point', (els) => els.map((e) => {
      const c = e.tagName === 'circle' ? e : e.querySelector('circle')!;
      return [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))];
    }));
    return pts.length === 2 ? Math.round(Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) * 1000) / 1000 : null;
  }).toBe(25);
});
