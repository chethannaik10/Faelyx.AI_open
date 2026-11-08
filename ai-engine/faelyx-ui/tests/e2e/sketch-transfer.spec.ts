import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { click, dblclick, esc, input, openSketch, tool } from './helpers';

// Sketch → 3D transfer, primary planes and the edit loop
// (docs/changes/2026-10-04-sketch-to-3d-auto-transfer.md and
// docs/changes/2026-10-04-sketch-workflow-3d-planes.md). Real geometry
// through the backend, checked against closed-form sizes.

const API = 'http://127.0.0.1:8000';
type Sent = { features: Record<string, unknown>[]; modifiers: Record<string, unknown>[] };
type Probe = {
  planes: () => { plane: string; color: string; size: number }[];
  sketches: () => { id: string; selected: boolean; points: number[][] }[];
  live: () => number[][];
  screenOf: (p: number[]) => { x: number; y: number };
  camera: () => { position: number[]; target: number[]; up: number[] };
};

test.beforeEach(async ({ page }) => { await openSketch(page); });

async function rect(page: Page, h: number, v: number, w: number, ht: number) {
  await tool(page, 'Rectangle');
  await input(page, 'Corner H (mm)').fill(String(h)); await input(page, 'V (mm)').fill(String(v));
  await input(page, 'Width').fill(String(w)); await input(page, 'Height').fill(String(ht)); await input(page, 'Height').press('Enter');
  await esc(page);
}
const sketchTab = (page: Page) => page.locator('.workspace-nav button', { hasText: 'Sketch & 2D' }).click();
const designTab = (page: Page) => page.locator('.workspace-nav button', { hasText: '3D Design' }).click();
const activeTab = (page: Page) => page.locator('.workspace-nav button.workspace-active');
const exitWorkbench = (page: Page) => page.getByRole('button', { name: 'Exit workbench' }).click();
async function plane(page: Page, p: 'Front' | 'Top' | 'Right') {
  const card = page.getByRole('button', { name: new RegExp(`^${p} Plane`) });
  if (await card.isVisible()) await card.click();
  else await page.locator('.plane-switcher button', { hasText: p }).click();
  await expect(page.locator('.plane-switcher button.plane-active')).toHaveText(p);
}
async function tool3d(page: Page, name: string) {
  await page.locator('.toolbox-panel .tool-item').filter({ has: page.locator(`span:text-is("${name}")`) }).first().click();
  await expect(page.locator('.property-title strong:visible')).toHaveText(name);
}
const field = (page: Page, label: string | RegExp) => page.locator('.property-input:visible', { hasText: label }).locator('input, select').first();
const buildRequest = (page: Page) => page.waitForResponse((r) => r.url().includes('/build_part') && r.request().method() === 'POST');
const sentOf = async (res: Awaited<ReturnType<typeof buildRequest>>): Promise<Sent> => { expect(res.status(), await res.text()).toBe(200); return JSON.parse(res.request().postData() ?? '{}'); };
async function apply(page: Page): Promise<Sent> {
  const done = buildRequest(page);
  await page.locator('.apply-property').click();
  const sent = await sentOf(await done);
  await expect(page.locator('.app-toast')).toHaveCount(0);
  return sent;
}
async function inspect(request: APIRequestContext, sent: Sent) {
  const r = await request.post(`${API}/inspect_part`, { data: { features: sent.features, modifiers: sent.modifiers } });
  expect(r.status(), await r.text()).toBe(200);
  return r.json() as Promise<{ volumeMm3: number; boundingBoxMm: { x: number; y: number; z: number } }>;
}
// What the 3D viewport is drawing (StlViewport's probe).
const probe = <T,>(page: Page, fn: (p: Probe) => T) => page.evaluate((src) => {
  const el = [...document.querySelectorAll('.model-stage > div')].find((d) => '__faelyx3d' in d) as unknown as { __faelyx3d: unknown };
  return new Function('p', `return (${src})(p)`)(el.__faelyx3d);
}, fn.toString()) as Promise<T>;
const selectMode = (page: Page) => page.getByRole('button', { name: 'Select', exact: true }).click();
const sketchRow = (page: Page, name: string) => page.locator('.model-panel:visible .tree-row', { hasText: name });
const rectSize = (page: Page) => page.$$eval('svg.sketch-svg line.sketch-line', (ls) => {
  const xs = ls.flatMap((l) => [Number(l.getAttribute('x1')), Number(l.getAttribute('x2'))]);
  const ys = ls.flatMap((l) => [Number(l.getAttribute('y1')), Number(l.getAttribute('y2'))]);
  return { n: ls.length, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
});
const extent = (pts: number[][], axis: number) => Math.max(...pts.map((p) => p[axis])) - Math.min(...pts.map((p) => p[axis]));
const treeRows = (page: Page) => page.locator('.model-panel:visible .tree-content .tree-row, .model-panel:visible .tree-content .tree-separator').allInnerTexts();

// ---- docs/changes/2026-10-04-sketch-to-3d-auto-transfer.md ----------------

test('Exit Workbench keeps the sketch as Sketch.1 with no prompt; an empty exit adds nothing', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', (d) => { dialogs++; void d.dismiss(); });
  await rect(page, 0, 0, 40, 30);
  await exitWorkbench(page);
  await expect(activeTab(page)).toContainText('3D Design');
  await expect(sketchRow(page, 'Sketch.1 (Front')).toHaveClass(/tree-selected/);
  // Under PartBody: the row right after it.
  const rows = await treeRows(page);
  expect(rows.findIndex((t) => t.startsWith('Sketch.1'))).toBe(rows.findIndex((t) => t.startsWith('PartBody')) + 1);
  // Drawn in 3D, highlighted, floating 0.5 mm off the Front plane (normal −Y).
  const drawn = await probe(page, (p) => p.sketches());
  expect(drawn).toHaveLength(1);
  expect(drawn[0].selected).toBe(true);
  for (const pt of drawn[0].points) expect(pt[1]).toBeCloseTo(-0.5, 6);
  expect(extent(drawn[0].points, 0)).toBeCloseTo(40, 6);
  expect(extent(drawn[0].points, 2)).toBeCloseTo(30, 6);
  // Back to an empty canvas and out again, by the tab this time: no duplicate.
  await sketchTab(page); await plane(page, 'Front');
  await designTab(page);
  await expect(activeTab(page)).toContainText('3D Design');
  await expect(page.locator('.model-panel:visible .tree-row', { hasText: /^Sketch./ })).toHaveCount(1);
  expect(dialogs).toBe(0);
});

test('sketches from Top, Right and a Reference Plane land on that support; deleting one removes its wireframe', async ({ page }) => {
  await plane(page, 'Top'); await rect(page, 0, 0, 20, 10); await exitWorkbench(page);
  await sketchTab(page); await plane(page, 'Right'); await rect(page, 0, 0, 20, 10); await exitWorkbench(page);
  let drawn = await probe(page, (p) => p.sketches());
  expect(drawn).toHaveLength(2);
  for (const pt of drawn[0].points) expect(pt[2]).toBeCloseTo(0.5, 6);      // Top: normal +Z
  for (const pt of drawn[1].points) expect(pt[0]).toBeCloseTo(0.5, 6);      // Right: normal +X
  expect(extent(drawn[1].points, 1)).toBeCloseTo(20, 6);
  // Move Sketch.2 onto a Reference Plane (XY, 30 mm) from the Pad box.
  await tool3d(page, 'Reference Plane');
  await field(page, 'Offset from origin').fill('30');
  await page.locator('.apply-property').click();
  await sketchRow(page, 'Sketch.2').click();
  await tool3d(page, 'Pad');
  await expect(page.locator('.pd-sketch-summary')).toContainText('Sketch.2');
  await field(page, 'Sketch support').selectOption({ label: 'Reference Plane.1 (XY, 30 mm)' });
  await expect(page.locator('.pd-sketch-summary')).toContainText('Reference Plane.1');
  drawn = await probe(page, (p) => p.sketches());
  for (const pt of drawn[1].points) expect(pt[2]).toBeCloseTo(30.5, 6);
  // Delete Sketch.1 from the tree.
  await sketchRow(page, 'Sketch.1').hover();
  await page.getByRole('button', { name: /^Delete Sketch\.1/ }).click();
  await expect(sketchRow(page, 'Sketch.1')).toHaveCount(0);
  expect(await probe(page, (p) => p.sketches().length)).toBe(1);
});

test('a sketch that is only points is not carried over: notice, and it stays in Sketch & 2D', async ({ page }) => {
  await tool(page, 'Point'); await click(page, 220, 140); await esc(page);
  await exitWorkbench(page);
  await expect(activeTab(page)).toContainText('3D Design');
  await expect(page.locator('.app-notice')).toContainText('Nothing was carried into 3D Design');
  await expect(page.locator('.model-panel:visible .tree-row', { hasText: /^Sketch./ })).toHaveCount(0);
  await sketchTab(page);
  await expect(page.locator('svg.sketch-svg .sketch-point')).toHaveCount(1);
});

test('Pad builds from the kept sketch on its own plane, straight after the transfer; a used sketch is hidden', async ({ page, request }) => {
  await rect(page, 0, 0, 40, 30);                                   // Front
  await exitWorkbench(page);
  await sketchTab(page); await plane(page, 'Top'); await rect(page, 0, 0, 10, 10); await exitWorkbench(page);
  // Pad the first sketch after the second was kept: still on Front.
  await sketchRow(page, 'Sketch.1').click();
  await tool3d(page, 'Pad');
  await expect(page.locator('.pd-sketch-summary')).toContainText('Sketch.1');
  await expect(page.locator('.pd-sketch-summary')).toContainText('Front (XZ)');
  const sent = await apply(page);
  expect(sent.features[0].plane).toMatchObject({ normal: [0, -1, 0], xDir: [1, 0, 0], origin: [0, 0, 0] });
  const d = await inspect(request, sent);
  expect(d.boundingBoxMm).toEqual({ x: expect.closeTo(40, 3), y: expect.closeTo(20, 3), z: expect.closeTo(30, 3) });
  expect(d.volumeMm3).toBeCloseTo(24000, 0);
  // Sketch.1 is used now: still in the tree, no longer drawn. Sketch.2 is.
  await expect(sketchRow(page, 'Sketch.1')).toContainText('used');
  expect(await probe(page, (p) => p.sketches().length)).toBe(1);
  // The next tool defaults to the sketch that is still unused.
  await tool3d(page, 'Pocket');
  await expect(page.locator('.pd-sketch-summary')).toContainText('Sketch.2');
});

test('a sketch kept while Body.2 is active is listed under Body.2; selecting a sketch moves the highlight', async ({ page }) => {
  await rect(page, 0, 0, 20, 10); await exitWorkbench(page);
  await tool3d(page, 'Insert Body'); await page.locator('.apply-property').click();
  await sketchTab(page); await plane(page, 'Top'); await rect(page, 0, 0, 10, 10); await exitWorkbench(page);
  const rows = await treeRows(page);
  const at = (t: string) => rows.findIndex((r) => r.startsWith(t));
  expect(at('Sketch.1')).toBe(at('PartBody') + 1);
  expect(at('Sketch.2')).toBe(at('Body.2') + 1);
  expect((await probe(page, (p) => p.sketches())).map((k) => k.selected)).toEqual([false, true]);
  await sketchRow(page, 'Sketch.1').click();
  expect((await probe(page, (p) => p.sketches())).map((k) => k.selected)).toEqual([true, false]);
  await expect(page.locator('.property-title:visible')).toContainText('SKETCH DEFINITION');
});

// ---- docs/changes/2026-10-04-sketch-workflow-3d-planes.md -----------------

test('the three primary planes are drawn in 3D Design in the Sketch & 2D colours; View settings hides them', async ({ page }) => {
  await designTab(page);
  expect(await probe(page, (p) => p.planes())).toEqual([
    { plane: 'Front', color: '#6a4bc2', size: 50 }, { plane: 'Top', color: '#3f6fc9', size: 50 }, { plane: 'Right', color: '#8a4fa8', size: 50 },
  ]);
  // Same colours as the plane picker's swatches.
  await sketchTab(page);
  await page.locator('button[aria-label="Exit plane"]').click();
  const swatch = (p: string) => page.locator(`.plane-swatch-${p}`).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect([await swatch('front'), await swatch('top'), await swatch('right')]).toEqual(['rgb(106, 75, 194)', 'rgb(63, 111, 201)', 'rgb(138, 79, 168)']);
  await page.getByRole('button', { name: /^Top Plane/ }).click();
  // Still there with a part.
  await rect(page, 0, 0, 100, 50); await exitWorkbench(page);
  await tool3d(page, 'Pad'); await apply(page);
  expect(await probe(page, (p) => p.planes().length)).toBe(3);
  await page.waitForTimeout(600);
  await page.locator('.model-viewport:visible').screenshot({ path: 'test-results/planes-with-part.png' });
  // Toggle off, and it stays off across a workspace switch and a reload.
  await page.getByRole('button', { name: 'View settings', exact: true }).click();
  const toggle = page.locator('.view-settings input[type="checkbox"]');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  expect(await probe(page, (p) => p.planes().length)).toBe(0);
  await sketchTab(page); await designTab(page);
  expect(await probe(page, (p) => p.planes().length)).toBe(0);
  await page.reload(); await page.getByRole('button', { name: /^Front Plane/ }).click(); await designTab(page);
  expect(await probe(page, (p) => p.planes().length)).toBe(0);
  await page.getByRole('button', { name: 'View settings', exact: true }).click();
  await page.locator('.view-settings input[type="checkbox"]').check();
  expect(await probe(page, (p) => p.planes().length)).toBe(3);
});

test('Exit Workbench saves a named project once; a failed save still switches and says so', async ({ page, request }) => {
  const name = `st-e2e-${Date.now()}`;
  page.on('dialog', (d) => void d.accept(name));
  await rect(page, 0, 0, 40, 30);
  const first = page.waitForResponse((r) => r.url().includes(`/projects/${name}`) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await first;
  try {
    const posts: string[] = [];
    page.on('request', (r) => { if (r.url().includes(`/projects/${name}`) && r.method() === 'POST') posts.push(r.postData() ?? ''); });
    await exitWorkbench(page);
    await expect(activeTab(page)).toContainText('3D Design');
    await expect(page.locator('.save-state')).toContainText('Synced');
    await page.waitForTimeout(2500);
    expect(posts).toHaveLength(1);
    const payload = JSON.parse(posts[0]);
    expect(payload.threeD.keptSketches).toHaveLength(1);
    expect(payload.threeD.keptSketches[0].data.lines).toHaveLength(4);
    // Reload, open: the kept sketch is drawn again and still opens for editing.
    await page.goto('/');
    await page.getByRole('button', { name: /^Front Plane/ }).click();
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.locator('.projects-row', { hasText: name }).click();
    await designTab(page);
    expect(await probe(page, (p) => p.sketches().length)).toBe(1);
    expect(await probe(page, (p) => p.planes().length)).toBe(3);
    await sketchRow(page, 'Sketch.1').dblclick();
    await expect(activeTab(page)).toContainText('Sketch');
    await expect(page.locator('.editing-sketch-chip')).toContainText('SKETCH.1');
    expect(await rectSize(page)).toMatchObject({ n: 4, w: 40, h: 30 });
    // Backend unreachable for the save: still goes to 3D Design, marked unsaved, with the error.
    await page.route(`**/projects/${name}`, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
    await exitWorkbench(page);
    await expect(activeTab(page)).toContainText('3D Design');
    await expect(page.locator('.app-toast')).toContainText('Could not save');
    await expect(page.locator('.save-state')).toContainText('Unsaved');
  } finally {
    await request.delete(`${API}/projects/${name}`);
  }
});

test('double-clicking a primary plane (Select mode) opens Sketch & 2D on that plane; a single click does not', async ({ page }) => {
  await designTab(page);
  const top = await probe(page, (p) => p.screenOf([15, 15, 0]));
  // Orbit mode (the default): nothing happens.
  await page.mouse.dblclick(top.x, top.y);
  await expect(activeTab(page)).toContainText('3D Design');
  await selectMode(page);
  await page.mouse.click(top.x, top.y);
  await page.waitForTimeout(500);
  await expect(activeTab(page)).toContainText('3D Design');
  // Nor does a drag that starts on the plane.
  await page.mouse.move(top.x, top.y); await page.mouse.down(); await page.mouse.move(top.x + 40, top.y + 25, { steps: 4 }); await page.mouse.up();
  await page.mouse.move(top.x, top.y);
  await page.waitForTimeout(500);
  await expect(activeTab(page)).toContainText('3D Design');
  await page.mouse.dblclick(top.x, top.y);
  await expect(activeTab(page)).toContainText('Sketch');
  await expect(page.locator('.plane-switcher button.plane-active')).toHaveText('Top');
  await designTab(page); await selectMode(page);
  const right = await probe(page, (p) => p.screenOf([0, 15, 15]));
  await page.mouse.dblclick(right.x, right.y);
  await expect(activeTab(page)).toContainText('Sketch');
  await expect(page.locator('.plane-switcher button.plane-active')).toHaveText('Right');
});

test('edit loop: double-click the sketch, change it, Exit Workbench rebuilds its features; Undo and Redo step it', async ({ page, request }) => {
  await plane(page, 'Top');
  await rect(page, 0, 0, 40, 30);
  await page.waitForTimeout(500);
  await exitWorkbench(page);
  await tool3d(page, 'Pad');
  let sent = await apply(page);
  expect((await inspect(request, sent)).volumeMm3).toBeCloseTo(24000, 0);
  // A pocket from a second sketch on top of the pad.
  await sketchTab(page); await plane(page, 'Top');
  await tool(page, 'Circle');
  await input(page, 'Center H (mm)').fill('20'); await input(page, 'V (mm)').fill('15');
  await input(page, 'R (mm)').fill('5'); await input(page, 'R (mm)').press('Enter');
  await esc(page);
  await exitWorkbench(page);
  await tool3d(page, 'Pocket'); await field(page, 'Depth (mm)').fill('5');
  sent = await apply(page);
  const withPocket = 24000 - Math.PI * 25 * 5;
  expect((await inspect(request, sent)).volumeMm3).toBeCloseTo(withPocket, -1);

  // Open Sketch.1 from the 3D viewport: its wireframe shows once it is selected.
  await sketchRow(page, 'Sketch.1').click();
  await selectMode(page);
  const onLine = await probe(page, (p) => { const k = p.sketches().find((x) => x.selected)!; const a = k.points[0], b = k.points[1]; return p.screenOf([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]); });
  await page.mouse.dblclick(onLine.x, onLine.y);
  await expect(activeTab(page)).toContainText('Sketch');
  await expect(page.locator('.editing-sketch-chip')).toContainText('SKETCH.1');
  await expect(page.locator('.plane-switcher button.plane-active')).toHaveText('Top');
  expect(await rectSize(page)).toMatchObject({ n: 4, w: 40, h: 30 });
  // Its constraints came back with it.
  expect(Number((await page.locator('.tree-separator', { hasText: 'CONSTRAINTS' }).innerText()).match(/\((\d+)\)/)![1])).toBeGreaterThan(0);
  // 40 → 50 wide.
  await page.waitForTimeout(500);
  await dblclick(page, 220, 150);
  const length = page.locator('[data-edit-group] .property-input', { hasText: 'Length' }).locator('input');
  await length.fill('50'); await length.press('Enter');
  await expect.poll(async () => (await rectSize(page)).w).toBeCloseTo(50, 3);
  await esc(page);
  let built = buildRequest(page);
  await exitWorkbench(page);
  sent = await sentOf(await built);
  await expect(activeTab(page)).toContainText('3D Design');
  expect(sent.features).toHaveLength(2);
  expect((await inspect(request, sent)).volumeMm3).toBeCloseTo(50 * 30 * 20 - Math.PI * 25 * 5, -1);
  await expect(page.locator('.model-panel:visible .tree-row', { hasText: /^Pad./ })).toHaveCount(1);
  await expect(page.locator('.app-toast')).toHaveCount(0);

  // Undo: the part and the sketch go back; Redo brings the edit back.
  built = buildRequest(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await inspect(request, await sentOf(await built))).volumeMm3).toBeCloseTo(withPocket, -1);
  expect(extent((await probe(page, (p) => p.sketches().find((x) => x.selected)!)).points, 0)).toBeCloseTo(40, 3);
  built = buildRequest(page);
  await page.keyboard.press('Control+y');
  expect((await inspect(request, await sentOf(await built))).volumeMm3).toBeCloseTo(50 * 30 * 20 - Math.PI * 25 * 5, -1);
});

test('an edit that breaks a feature is kept, explained, leaves the last good solid, and Undo steps back', async ({ page }) => {
  await rect(page, 0, 0, 40, 30);
  await page.waitForTimeout(500);
  await exitWorkbench(page);
  await tool3d(page, 'Pad'); await apply(page);
  await sketchRow(page, 'Sketch.1').dblclick();
  await expect(page.locator('.editing-sketch-chip')).toBeVisible();
  await page.waitForTimeout(500);
  // Delete the bottom side: no closed profile any more.
  await click(page, 220, 150);
  await page.keyboard.press('Delete');
  await expect(page.locator('svg.sketch-svg line.sketch-line')).toHaveCount(3);
  let builds = 0;
  page.on('request', (r) => { if (r.url().includes('/build_part')) builds++; });
  await exitWorkbench(page);
  await expect(activeTab(page)).toContainText('3D Design');
  await expect(page.locator('.app-toast')).toContainText('Sketch.1 was changed');
  await expect(page.locator('.app-toast')).toContainText('Undo');
  await expect(page.locator('.model-panel:visible .tree-row', { hasText: /^Pad.1/ })).toBeVisible();
  // No rebuild was attempted, so the solid on screen is the last good one.
  expect(builds).toBe(0);
  const built = buildRequest(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const sent = await sentOf(await built);
  expect(sent.features).toHaveLength(1);
  expect((sent.features[0].loops as unknown[]).length).toBe(1);
  await expect(page.locator('.app-toast')).toHaveCount(0);
});

test('Change sketch support: moving a sketch to another plane and offset moves the feature built from it', async ({ page, request }) => {
  await rect(page, 0, 0, 40, 30);                                   // Front
  await exitWorkbench(page);
  await tool3d(page, 'Pad'); await apply(page);
  await sketchRow(page, 'Sketch.1').click();
  await expect(page.locator('.property-title:visible')).toContainText('SKETCH DEFINITION');
  await expect(page.locator('.property-content:visible')).toContainText('Used by Pad.1');
  await field(page, 'Sketch support').selectOption({ label: 'Top (XY)' });
  await field(page, 'Sketch plane offset').fill('10');
  const built = buildRequest(page);
  await page.getByRole('button', { name: /Apply support/ }).click();
  const sent = await sentOf(await built);
  expect(sent.features[0].plane).toMatchObject({ normal: [0, 0, 1], origin: [0, 0, 10] });
  expect((await inspect(request, sent)).boundingBoxMm).toEqual({ x: expect.closeTo(40, 3), y: expect.closeTo(30, 3), z: expect.closeTo(20, 3) });
  await expect(sketchRow(page, 'Sketch.1 (Top')).toBeVisible();
});

test('orientation cube: smaller than before, hover and active states, faces still set the view', async ({ page }) => {
  await designTab(page);
  const wrap = page.locator('.view-cube-wrap');
  const box = (await wrap.boundingBox())!;
  // Before the redesign it measured 75 × 99.5 px.
  expect(box.width).toBeLessThan(75);
  expect(box.height).toBeLessThan(99.5);
  const front = page.locator('.cube-front');
  await expect(front).not.toHaveClass(/cube-active/);
  const bg = () => front.evaluate((el) => getComputedStyle(el).backgroundColor);
  const idle = await bg();
  expect(await front.evaluate((el) => getComputedStyle(el).transitionDuration)).not.toBe('0s');
  await front.hover();
  await expect.poll(bg).not.toBe(idle);
  await front.click();
  await expect(front).toHaveClass(/cube-active/);
  await expect(page.locator('.cube-caption')).toHaveText('FRONT');
  // The top face is a 3D-rotated element: click where it is on screen, and
  // check that point really is the top face.
  const topAt = await page.locator('.cube-top').evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    return { x, y, hit: document.elementFromPoint(x, y)?.className ?? '' };
  });
  expect(topAt.hit).toContain('cube-top');
  await page.mouse.click(topAt.x, topAt.y);
  await expect(page.locator('.cube-top')).toHaveClass(/cube-active/);
  await expect(front).not.toHaveClass(/cube-active/);
  await page.getByRole('button', { name: 'Rotate view right 45°' }).click();
  await page.mouse.move(10, 10);
  await page.waitForTimeout(400);
  await wrap.screenshot({ path: 'test-results/view-cube-after.png' });
  console.log('VIEW-CUBE-BOX-AFTER', JSON.stringify(box));
});

// ---- docs/changes/2026-10-05-view-menu-plane-offset.md --------------------

// Unit direction from the orbit target to the camera.
const viewDir = async (page: Page) => {
  const c = await probe(page, (p) => p.camera());
  const d = c.position.map((v, i) => v - c.target[i]);
  const len = Math.hypot(...d);
  return d.map((v) => v / len);
};

test('Views menu (⋮, top right): the seven views, in place of the bottom-bar buttons; in sync with the cube', async ({ page }) => {
  await designTab(page);
  // Nothing left in the bottom bar but its tools.
  const bar = page.locator('.navigation-bar');
  for (const label of ['FRONT', 'BACK', 'LEFT', 'RIGHT', 'TOP', 'BOTTOM', 'ISO']) await expect(bar.getByText(label, { exact: true })).toHaveCount(0);
  for (const name of ['Select', 'Orbit', 'Pan', 'Zoom', 'Fit all', 'Normal view', 'Compass']) await expect(bar.getByRole('button', { name, exact: true })).toBeVisible();
  // The ⋮ button: top right, clear of the cube and of View settings.
  const kebab = page.getByRole('button', { name: 'Views', exact: true });
  await expect(kebab).toHaveAttribute('title', 'Views');
  await expect(kebab).toHaveAttribute('aria-expanded', 'false');
  const dots = await kebab.locator('.more-dots i').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top }; }));
  expect(dots).toHaveLength(3);
  expect(dots[0].x).toBeCloseTo(dots[2].x, 1);
  expect(dots[2].y).toBeGreaterThan(dots[0].y);
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const size of [{ width: 1024, height: 640 }, { width: 1600, height: 950 }]) {
    await page.setViewportSize(size);
    const k = (await kebab.boundingBox())!, vp = (await page.locator('.model-viewport:visible').boundingBox())!;
    expect(vp.x + vp.width - (k.x + k.width)).toBeLessThan(30);
    expect(k.y - vp.y).toBeLessThan(30);
    expect(overlaps(k, (await page.locator('.view-cube-wrap').boundingBox())!)).toBe(false);
    expect(overlaps(k, (await page.getByRole('button', { name: 'View settings', exact: true }).boundingBox())!)).toBe(false);
  }
  // Keyboard: focus it, Enter opens the menu.
  await kebab.focus(); await page.keyboard.press('Enter');
  await expect(kebab).toHaveAttribute('aria-expanded', 'true');
  const items = page.locator('.view-menu [role="menuitemradio"]');
  expect((await items.allInnerTexts()).map((t) => t.replace('✓', '').trim())).toEqual(['Isometric (Iso)', 'Front', 'Back', 'Left', 'Right', 'Top', 'Bottom']);
  await expect(page.locator('.view-menu [aria-checked="true"]')).toContainText('Isometric (Iso)');
  // Esc and an outside click close it without changing the view.
  const iso = await viewDir(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.view-menu')).toHaveCount(0);
  await kebab.click(); await expect(page.locator('.view-menu')).toBeVisible();
  await page.locator('.coordinate-readout').click();
  await expect(page.locator('.view-menu')).toHaveCount(0);
  (await viewDir(page)).forEach((v, i) => expect(v).toBeCloseTo(iso[i], 6));
  // Each entry sets its view and closes the menu.
  const dirs: Record<string, number[]> = { Front: [0, 0, 1], Back: [0, 0, -1], Left: [-1, 0, 0], Right: [1, 0, 0], Top: [0, 1, 0], Bottom: [0, -1, 0], 'Isometric (Iso)': [1, 0.875, 1].map((v) => v / Math.hypot(1, 0.875, 1)) };
  for (const [name, dir] of Object.entries(dirs)) {
    await kebab.click();
    await page.locator('.view-menu').getByText(name, { exact: true }).click();
    await expect(page.locator('.view-menu')).toHaveCount(0);
    await expect.poll(async () => (await viewDir(page)).map((v) => Math.round(v * 1000) / 1000)).toEqual(dir.map((v) => Math.round(v * 1000) / 1000));
    await kebab.click();
    await expect(page.locator('.view-menu [aria-checked="true"]')).toContainText(name);
    await page.keyboard.press('Escape');
  }
  // In sync with the cube, both ways.
  await kebab.click(); await page.locator('.view-menu').getByText('Front', { exact: true }).click();
  await expect(page.locator('.cube-front')).toHaveClass(/cube-active/);
  await expect(page.locator('.cube-caption')).toHaveText('FRONT');
  await page.locator('.cube-right').click();
  await kebab.click();
  await expect(page.locator('.view-menu [aria-checked="true"]')).toContainText('Right');
  await page.locator('.model-viewport:visible').screenshot({ path: 'test-results/views-menu.png' });
});
