import { expect, test, type Page } from '@playwright/test';
import { click, esc, lineCoords, openSketch, tool, toScreen } from './helpers';

// Deleting an entity takes the points only it used (its end points, a
// circle's centre) with it — as one undo step — while shared or
// constrained points stay. And every measurement label on the canvas
// opens the same inline editor on double-click.

test.beforeEach(async ({ page }) => { await openSketch(page); });

const lines = (page: Page) => page.locator('svg.sketch-svg line.sketch-line');
const circles = (page: Page) => page.locator('svg.sketch-svg circle.sketch-circle');
const points = (page: Page) => page.locator('svg.sketch-svg .sketch-point');

// Two lines sharing a corner: (150,150)-(180,150) and (180,150)-(180,120).
async function lShape(page: Page) {
  await tool(page, 'Line');
  await click(page, 150, 150); await click(page, 180, 150);
  await click(page, 180, 150); await click(page, 180, 120);
  await esc(page);
  await page.waitForTimeout(500);
  await expect(lines(page)).toHaveCount(2);
  await expect(points(page)).toHaveCount(3);
}

test('deleting a line removes its free end point but keeps the shared corner', async ({ page }) => {
  await lShape(page);
  await click(page, 165, 150);                         // the horizontal line
  await page.keyboard.press('Delete');
  await expect(lines(page)).toHaveCount(1);
  await expect(points(page)).toHaveCount(2);            // (150,150) gone, the corner stays
  const pts = await page.$$eval('svg.sketch-svg circle.sketch-point', (cs) => cs.map((c) => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]));
  expect(pts).not.toContainEqual([150, 150]);
});

test('Ctrl+Z restores the deleted line and its point together, in one step', async ({ page }) => {
  await lShape(page);
  await click(page, 165, 150);
  await page.keyboard.press('Delete');
  await expect(points(page)).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(lines(page)).toHaveCount(2);
  await expect(points(page)).toHaveCount(3);
  await page.keyboard.press('ControlOrMeta+y');
  await expect(lines(page)).toHaveCount(1);
  await expect(points(page)).toHaveCount(2);
});

test('deleting the last line leaves no stray points', async ({ page }) => {
  await tool(page, 'Line');
  await click(page, 150, 150); await click(page, 190, 150);
  await esc(page);
  await click(page, 170, 150);
  await page.keyboard.press('Delete');
  await expect(lines(page)).toHaveCount(0);
  await expect(points(page)).toHaveCount(0);
});

test('deleting a circle removes its centre unless the centre is constrained', async ({ page }) => {
  await tool(page, 'Circle');
  await click(page, 150, 100); await click(page, 165, 100);   // free circle
  await click(page, 250, 100); await click(page, 265, 100);   // circle to pin
  await esc(page);
  await expect(circles(page)).toHaveCount(2);
  await expect(points(page)).toHaveCount(2);
  // Fix the second circle's centre.
  await click(page, 250, 100);
  await page.locator('.tool-item').filter({ has: page.locator('span:text-is("Fixed")') }).first().click();
  await esc(page);
  await page.waitForTimeout(400);
  // Delete both circles (click each rim).
  await click(page, 165, 100); await page.keyboard.press('Delete');
  await expect(circles(page)).toHaveCount(1);
  await expect(points(page)).toHaveCount(1);                  // the free centre went with its circle
  await click(page, 265, 100); await page.keyboard.press('Delete');
  await expect(circles(page)).toHaveCount(0);
  await expect(points(page)).toHaveCount(1);                  // the Fixed centre stays
});

async function dblclickLabel(page: Page, label: import('@playwright/test').Locator) {
  const box = (await label.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
}

test('double-clicking a measurement opens a tight inline editor; Enter commits', async ({ page }) => {
  await tool(page, 'Line');
  await click(page, 150, 150); await click(page, 180, 150);
  await esc(page);
  await click(page, 165, 150);                         // select → its length reading appears
  const label = page.locator('svg.sketch-svg text.dim-label').first();
  await expect(label).toHaveText(/^\d+\.\d\d$/);
  const shown = (await label.textContent())!;
  await dblclickLabel(page, label);
  const editor = page.locator('svg.sketch-svg input.dim-edit-input');
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue(shown);              // pre-filled with the current value
  // Sleek chip: green fill, small radius, hugging the value.
  const style = await editor.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, radius: parseFloat(s.borderTopLeftRadius) }; });
  expect(style.bg).toBe('rgb(112, 206, 158)');
  expect(style.radius).toBeGreaterThanOrEqual(2);
  expect(style.radius).toBeLessThanOrEqual(4);
  const host = page.locator('svg.sketch-svg foreignObject.dim-edit-host');
  expect(Number(await host.getAttribute('width'))).toBeLessThan(30);
  await editor.fill('45'); await editor.press('Enter');
  await expect.poll(async () => (await lineCoords(page)).some(([x1, y1, x2, y2]) => y1 === y2 && Math.abs(Math.abs(x2 - x1) - 45) < 1e-3)).toBe(true);
});

test('a read-only reading also opens the editor on double-click, and explains instead of committing', async ({ page }) => {
  // Two skew lines whose shortest gap lands partway along one of them:
  // measurable, but no constraint can drive it.
  await tool(page, 'Line');
  await click(page, 150, 150); await click(page, 190, 150);
  await click(page, 170, 140); await click(page, 200, 100);
  await esc(page);
  await click(page, 165, 150);
  const b = await toScreen(page, 185, 120);
  await page.keyboard.down('Shift'); await page.mouse.click(b.x, b.y); await page.keyboard.up('Shift');
  const reading = page.locator('svg.sketch-svg text.dim-label-readonly').first();
  await expect(reading).toBeVisible();
  await dblclickLabel(page, reading);
  const editor = page.locator('svg.sketch-svg input.dim-edit-input');
  await expect(editor).toBeFocused();
  await editor.fill('5'); await editor.press('Enter');
  await expect(editor).toHaveCount(0);
  await expect(page.getByText(/read-only — no constraint can drive it/)).toBeVisible();
});

test('Escape cancels an inline edit without applying anything', async ({ page }) => {
  await tool(page, 'Line');
  await click(page, 150, 150); await click(page, 180, 150);
  await esc(page);
  await click(page, 165, 150);
  const before = await lineCoords(page);
  const label = page.locator('svg.sketch-svg text.dim-label').first();
  await dblclickLabel(page, label);
  const editor = page.locator('svg.sketch-svg input.dim-edit-input');
  await editor.fill('45'); await editor.press('Escape');
  await expect(editor).toHaveCount(0);
  await page.waitForTimeout(400);
  expect(await lineCoords(page)).toEqual(before);
  await expect(page.locator('svg.sketch-svg text.dim-label')).toHaveCount(1); // still just the selection's reading, not a new dimension
});
