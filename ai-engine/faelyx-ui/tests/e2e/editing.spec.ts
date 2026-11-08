import { expect, test } from '@playwright/test';
import { click, dblclick, esc, input, lineCoords, openSketch, tool } from './helpers';

// Editing in Sketch & 2D: undo/redo (also mid-tool), cut/copy/paste,
// double-click to edit, editable chamfer angle, and the Exit Plane view.

test.beforeEach(async ({ page }) => { await openSketch(page); });

const lineCount = (page: import('@playwright/test').Page) => page.locator('svg.sketch-svg line.sketch-line');
async function typedRect(page: import('@playwright/test').Page, h = '0', v = '0', w = '40', ht = '20') {
  await tool(page, 'Rectangle');
  await input(page, 'Corner H (mm)').fill(h); await input(page, 'V (mm)').fill(v);
  await input(page, 'Width').fill(w); await input(page, 'Height').fill(ht); await input(page, 'Height').press('Enter');
  await esc(page);
  await page.waitForTimeout(500);
}

test('Ctrl+Z undoes a whole rectangle, Ctrl+Y brings it back', async ({ page }) => {
  await typedRect(page);
  await expect(lineCount(page)).toHaveCount(4);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(lineCount(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+y');
  await expect(lineCount(page)).toHaveCount(4);
  await page.keyboard.press('ControlOrMeta+Shift+z'); // nothing left to redo: no change
  await expect(lineCount(page)).toHaveCount(4);
});

test('Ctrl+Z while a tool is in use drops the half-drawn step and keeps the tool', async ({ page }) => {
  await tool(page, 'Line');
  await click(page, 150, 150); await click(page, 180, 150);  // one finished line
  await page.waitForTimeout(500);
  await click(page, 150, 120);                               // start of a second one
  await page.keyboard.press('ControlOrMeta+z');
  await expect(lineCount(page)).toHaveCount(1);              // the finished line stays
  await click(page, 150, 100); await click(page, 190, 100);  // the Line tool is still active
  await expect(lineCount(page)).toHaveCount(2);
  await page.waitForTimeout(500);
  await page.keyboard.press('ControlOrMeta+z');              // and a plain undo removes that line
  await expect(lineCount(page)).toHaveCount(1);
});

test('Ctrl+C / Ctrl+V pastes an offset copy; Ctrl+X then Ctrl+V puts it back in place', async ({ page }) => {
  await typedRect(page);
  const before = await lineCoords(page);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(lineCount(page)).toHaveCount(8);
  const pasted = (await lineCoords(page)).slice(4);
  // Same rectangle, 10 right and 10 up (canvas y is down).
  for (const [x1, y1, x2, y2] of pasted) expect(before).toContainEqual([x1 - 10, y1 + 10, x2 - 10, y2 + 10]);
  await page.keyboard.press('ControlOrMeta+x');              // the pasted copy is selected: cut it
  await expect(lineCount(page)).toHaveCount(4);
  await page.keyboard.press('ControlOrMeta+v');
  await expect(lineCount(page)).toHaveCount(8);
  const back = (await lineCoords(page)).slice(4);
  expect(back.map((l) => l.map((n) => Math.round(n)))).toEqual(pasted.map((l) => l.map((n) => Math.round(n))));
});

test('double-clicking an element opens its values for editing', async ({ page }) => {
  await typedRect(page);
  await dblclick(page, 220, 150);                            // the bottom side
  const length = page.locator('[data-edit-group] .property-input', { hasText: 'Length' }).locator('input');
  await expect(length).toBeFocused();
  await length.fill('30'); await length.press('Enter');
  await expect.poll(async () => (await lineCoords(page)).some(([x1, y1, x2, y2]) => y1 === y2 && Math.abs(Math.abs(x2 - x1) - 30) < 1e-3)).toBe(true);
});

test('a chamfer angle stays editable after the chamfer is made', async ({ page }) => {
  await typedRect(page, '0', '0', '80', '50');
  await tool(page, 'Chamfer');
  await input(page, 'First length (mm)').fill('30'); await input(page, 'Angle (°)').fill('30');
  await click(page, 250, 150); await click(page, 280, 125);
  await esc(page);
  const chamfer = (await lineCoords(page)).at(-1)!;
  await dblclick(page, (chamfer[0] + chamfer[2]) / 2, (chamfer[1] + chamfer[3]) / 2);
  const angle = page.locator('[data-edit-group] .property-input', { hasText: 'Chamfer angle' }).locator('input');
  await expect(angle).toHaveValue('30.0');
  await angle.fill('45'); await angle.press('Enter');
  await expect.poll(async () => {
    const [x1, y1, x2, y2] = (await lineCoords(page)).at(-1)!;
    return Math.round((Math.atan2(Math.abs(y2 - y1), Math.abs(x2 - x1)) * 180) / Math.PI);
  }).toBe(45);
});

test('Exit Plane shows the sketch where it really is relative to the axes', async ({ page }) => {
  await typedRect(page, '20', '10', '40', '20');             // right of and above the origin
  await page.getByRole('button', { name: 'Exit plane' }).click();
  const pts = await page.$$eval('.iso-plane-active polyline.iso-plane-entity', (ps) => ps.flatMap((p) => (p.getAttribute('points') ?? '').trim().split(' ').map((xy) => xy.split(',').map(Number))));
  expect(pts.length).toBeGreaterThan(0);
  // Front plane: H is +X (to the lower right in the iso view), V is +Z (up).
  // The rectangle's nearest corner is (20,10) and its farthest (60,30):
  // one shared scale puts the far corner at 0.9 of the frame.
  const s = 0.9 / 60, cos30 = Math.cos(Math.PI / 6);
  const xs = pts.map(([x]) => x), ys = pts.map(([, y]) => y);
  expect(Math.min(...xs)).toBeCloseTo(20 * s * cos30, 3);
  expect(Math.max(...xs)).toBeCloseTo(60 * s * cos30, 3);
  expect(Math.max(...ys)).toBeCloseTo((60 * 0.5 - 10) * s, 3);   // lowest point: corner (60,10)
  expect(Math.min(...ys)).toBeCloseTo((20 * 0.5 - 30) * s, 3);   // highest: corner (20,30)
});
