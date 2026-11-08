import { expect, test, type Page } from '@playwright/test';
import { openSketch } from './helpers';

// Mouse navigation and fit shortcuts in the 3D Design viewport
// (docs/changes/2026-10-05-viewport-controls-shortcuts.md), read back
// from the camera StlViewport's probe exposes.

type Cam = { position: number[]; target: number[]; up: number[] };
type Probe = { camera: () => Cam; screenOf: (p: number[]) => { x: number; y: number } };

const probe = <T,>(page: Page, fn: (p: Probe) => T) => page.evaluate((src) => {
  const el = [...document.querySelectorAll('.model-stage > div')].find((d) => '__faelyx3d' in d) as unknown as { __faelyx3d: unknown };
  return new Function('p', `return (${src})(p)`)(el.__faelyx3d);
}, fn.toString()) as Promise<T>;

// The camera once damping has run out.
async function cam(page: Page) {
  await page.waitForTimeout(700);
  const c = await probe(page, (p) => p.camera());
  const d = c.position.map((v, i) => v - c.target[i]);
  const distance = Math.hypot(...d);
  return { ...c, distance, dir: d.map((v) => v / distance) };
}
const moved = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
// A free spot on the canvas: up and left of the middle, clear of the
// "No model generated yet" label that sits over the centre.
async function centre(page: Page) {
  const box = (await page.locator('.model-stage canvas').boundingBox())!;
  return { x: box.x + box.width / 2 - 200, y: box.y + box.height / 2 - 140 };
}
async function drag(page: Page, button: 'left' | 'middle' | 'right', dx: number, dy: number) {
  const c = await centre(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down({ button });
  await page.mouse.move(c.x + dx, c.y + dy, { steps: 6 });
  await page.mouse.up({ button });
}

test.beforeEach(async ({ page }) => {
  await openSketch(page);
  await page.locator('.workspace-nav button', { hasText: '3D Design' }).click();
  await expect(page.locator('.model-stage canvas')).toBeVisible();
});

test('middle-drag and right-drag pan, in Orbit and in Select mode', async ({ page }) => {
  for (const mode of ['Orbit', 'Select']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    for (const button of ['middle', 'right'] as const) {
      const before = await cam(page);
      await drag(page, button, 90, 40);
      const after = await cam(page);
      expect(moved(after.target, before.target), `${mode} ${button}`).toBeGreaterThan(1);
      expect(after.distance).toBeCloseTo(before.distance, 4);
      after.dir.forEach((v, i) => expect(v).toBeCloseTo(before.dir[i], 5));
    }
  }
  // No browser context menu handler got through, and the workspace is unchanged.
  await expect(page.locator('.workspace-nav button.workspace-active')).toContainText('3D Design');
});

test('the wheel zooms toward the point under the cursor', async ({ page }) => {
  const point = [60, 0, 40];
  const at = await probe(page, (p) => p.screenOf([60, 0, 40]));
  const box = (await page.locator('.model-stage canvas').boundingBox())!;
  expect(Math.hypot(at.x - (box.x + box.width / 2), at.y - (box.y + box.height / 2))).toBeGreaterThan(40);       // well off-centre
  const before = await cam(page);
  await page.mouse.move(at.x, at.y);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -120);
  const after = await cam(page);
  expect(moved(after.position, point)).toBeLessThan(moved(before.position, point) * 0.8);
  const now = await probe(page, (p) => p.screenOf([60, 0, 40]));
  expect(Math.hypot(now.x - at.x, now.y - at.y)).toBeLessThan(4);
  // And back out again.
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 120);
  const out = await cam(page);
  expect(moved(out.position, point)).toBeGreaterThan(moved(after.position, point));
});

test('Ctrl + middle-drag zooms (up = in, down = out); without Ctrl the next middle-drag pans again', async ({ page }) => {
  const start = await cam(page);
  await page.keyboard.down('Control');
  await drag(page, 'middle', 0, -80);
  const closer = await cam(page);
  expect(closer.distance).toBeLessThan(start.distance * 0.98);
  await drag(page, 'middle', 0, 120);
  const further = await cam(page);
  expect(further.distance).toBeGreaterThan(closer.distance * 1.02);
  await page.keyboard.up('Control');
  await drag(page, 'middle', 80, 0);
  const panned = await cam(page);
  expect(panned.distance).toBeCloseTo(further.distance, 4);
  expect(moved(panned.target, further.target)).toBeGreaterThan(1);
});

test('Alt + left-drag and middle + right together orbit; one button left held goes back to its own action', async ({ page }) => {
  // Alt + left, in the modes where a plain left-drag does something else.
  for (const mode of ['Select', 'Pan', 'Zoom']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    const before = await cam(page);
    await page.keyboard.down('Alt');
    await drag(page, 'left', 120, 30);
    await page.keyboard.up('Alt');
    const after = await cam(page);
    expect(moved(after.dir, before.dir), mode).toBeGreaterThan(0.05);
    expect(after.distance).toBeCloseTo(before.distance, 3);
    expect(moved(after.target, before.target)).toBeLessThan(1e-6);
  }
  // Middle + right.
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const before = await cam(page);
  const c = await centre(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(c.x + 120, c.y + 40, { steps: 8 });
  const turned = await cam(page);
  expect(moved(turned.dir, before.dir)).toBeGreaterThan(0.05);
  expect(turned.distance).toBeCloseTo(before.distance, 3);
  expect(moved(turned.target, before.target)).toBeLessThan(1e-6);
  // Right released: the middle button alone pans from here, with no jump.
  await page.mouse.up({ button: 'right' });
  await page.mouse.move(c.x + 150, c.y + 40, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  const panned = await cam(page);
  panned.dir.forEach((v, i) => expect(v).toBeCloseTo(turned.dir[i], 5));
  const shift = moved(panned.target, turned.target);
  expect(shift).toBeGreaterThan(0.5);
  // 30 px of pan, not the 150 px since the drag began.
  const perPixel = (2 * turned.distance * Math.tan((50 * Math.PI) / 360)) / (await page.locator('.model-stage canvas').boundingBox())!.height;
  expect(shift).toBeLessThan(60 * perPixel);
});

test('F and a middle double-click fit the view like the Fit all button; a single middle click and F in a field do not', async ({ page }) => {
  const c = await centre(page);
  const zoomOut = async () => { await page.mouse.move(c.x, c.y); for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 240); };
  await page.getByRole('button', { name: 'Fit all', exact: true }).click();
  const fitted = await cam(page);
  // F.
  await zoomOut();
  const far = await cam(page);
  expect(far.distance).toBeGreaterThan(fitted.distance * 1.5);
  await page.keyboard.press('f');
  expect((await cam(page)).distance).toBeCloseTo(fitted.distance, 3);
  // F typed in a field leaves the view alone.
  await zoomOut();
  const far2 = await cam(page);
  const field = page.locator('textarea:visible, input[type="text"]:visible, input[type="number"]:visible').first();
  await field.focus();
  await page.keyboard.press('f');
  expect((await cam(page)).distance).toBeCloseTo(far2.distance, 3);
  await field.blur();
  // One middle click: nothing.
  await page.mouse.move(c.x, c.y);
  await page.mouse.click(c.x, c.y, { button: 'middle' });
  expect((await cam(page)).distance).toBeCloseTo(far2.distance, 3);
  // Two in a row: fit.
  await page.mouse.click(c.x, c.y, { button: 'middle' });
  await page.mouse.click(c.x, c.y, { button: 'middle', delay: 20 });
  expect((await cam(page)).distance).toBeCloseTo(fitted.distance, 3);
});
