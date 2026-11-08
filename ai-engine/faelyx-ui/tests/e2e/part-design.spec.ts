import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { click, esc, input, openSketch, tool } from './helpers';

// CATIA Part Design tools in 3D Design, driven by sketches from Sketch & 2D
// (docs/changes/2026-09-29-catia-part-design-3d.md). Each test builds real
// geometry through the backend and checks it against closed-form sizes.

const API = 'http://127.0.0.1:8000';
type Sent = { features: Record<string, unknown>[]; modifiers: Record<string, unknown>[] };

test.beforeEach(async ({ page }) => { await openSketch(page); });

async function rect(page: Page, h: number, v: number, w: number, ht: number) {
  await tool(page, 'Rectangle');
  await input(page, 'Corner H (mm)').fill(String(h)); await input(page, 'V (mm)').fill(String(v));
  await input(page, 'Width').fill(String(w)); await input(page, 'Height').fill(String(ht)); await input(page, 'Height').press('Enter');
  await esc(page);
}
async function circle(page: Page, h: number, v: number, r: number) {
  await tool(page, 'Circle');
  await input(page, 'Center H (mm)').fill(String(h)); await input(page, 'V (mm)').fill(String(v));
  await input(page, 'R (mm)').fill(String(r)); await input(page, 'R (mm)').press('Enter');
  await esc(page);
}
// Sketch coordinates → canvas (origin marker at 200,150; canvas y down).
const cv = (x: number, y: number): [number, number] => [200 + x, 150 - y];
async function polyline(page: Page, pts: [number, number][]) {
  await tool(page, 'Line');
  for (let i = 0; i + 1 < pts.length; i++) { await click(page, ...cv(...pts[i])); await click(page, ...cv(...pts[i + 1])); }
  await esc(page);
  await page.waitForTimeout(400);
}
const sketchTab = (page: Page) => page.locator('.workspace-nav button', { hasText: 'Sketch & 2D' }).click();
const designTab = (page: Page) => page.locator('.workspace-nav button', { hasText: '3D Design' }).click();
// After each feature the sketch clears and the plane picker asks where the
// next sketch goes (as CATIA does); otherwise switch with the plane switcher.
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
async function apply(page: Page, path = '/build_part'): Promise<Sent> {
  const done = page.waitForResponse((r) => r.url().includes(path) && r.request().method() === 'POST');
  await page.locator('.apply-property').click();
  const res = await done;
  expect(res.status(), await res.text()).toBe(200);
  await expect(page.locator('.app-toast')).toHaveCount(0);
  return JSON.parse(res.request().postData() ?? '{}');
}
async function inspect(request: APIRequestContext, sent: Sent) {
  const r = await request.post(`${API}/inspect_part`, { data: { features: sent.features, modifiers: sent.modifiers } });
  expect(r.status(), await r.text()).toBe(200);
  return r.json() as Promise<{ volumeMm3: number; boundingBoxMm: { x: number; y: number; z: number }; solidCount: number }>;
}

test('toolbox is organised as CATIA Part Design toolbars; unavailable tools are disabled', async ({ page }) => {
  await designTab(page);
  const groups = await page.locator('.toolbox-panel:visible .section-toggle > span').allInnerTexts();
  expect(groups.slice(0, 6)).toEqual(['SKETCH-BASED FEATURES', 'DRESS-UP FEATURES', 'SURFACE-BASED FEATURES', 'TRANSFORMATION FEATURES', 'BOOLEAN OPERATIONS', 'REFERENCE ELEMENTS']);
  await expect(page.locator('.tool-item', { hasText: 'Thick Surface' })).toBeDisabled();
  for (const name of ['Pad', 'Pocket', 'Shaft', 'Groove', 'Hole', 'Rib', 'Slot', 'Stiffener', 'Draft', 'Shell', 'Split', 'Translation', 'Insert Body']) {
    await expect(page.locator('.tool-item').filter({ has: page.locator(`span:text-is("${name}")`) }).first()).toBeEnabled();
  }
});

test('a sketch builds on its own plane: Front = XZ, Right = YZ, Top = XY', async ({ page, request }) => {
  await rect(page, 0, 0, 40, 30);                       // Front plane (default)
  await designTab(page);
  await tool3d(page, 'Pad');
  await expect(page.locator('.pd-sketch-summary')).toContainText('Front (XZ)');
  let sent = await apply(page);
  expect(sent.features[0].plane).toMatchObject({ normal: [0, -1, 0], xDir: [1, 0, 0] });
  let d = await inspect(request, sent);
  expect(d.boundingBoxMm).toEqual({ x: expect.closeTo(40, 3), y: expect.closeTo(20, 3), z: expect.closeTo(30, 3) });

  await sketchTab(page); await plane(page, 'Right');
  await rect(page, 0, 0, 10, 10);
  await designTab(page); await tool3d(page, 'Pad');
  await expect(page.locator('.pd-sketch-summary')).toContainText('Right (YZ)');
  sent = await apply(page);
  expect(sent.features[1].plane).toMatchObject({ normal: [1, 0, 0] });
  d = await inspect(request, sent);
  expect(d.volumeMm3).toBeCloseTo(40 * 20 * 30 + 10 * 10 * 20 - 0, -1);   // pad along +X from x = 0 overlaps nothing but the edge
  await expect(page.locator('.tree-row', { hasText: 'Pad.2' })).toBeVisible();
});

test('Pad definition options, then edit it from the tree', async ({ page, request }) => {
  await plane(page, 'Top');
  await rect(page, 0, 0, 10, 10);
  await designTab(page); await tool3d(page, 'Pad');
  await field(page, 'Length (mm)').fill('10');
  await page.locator('.property-check:visible', { hasText: 'Mirrored extent' }).locator('input').check();
  let sent = await apply(page);
  expect(sent.features[0]).toMatchObject({ op: 'pad', depth: 10, mirrored: true, limit: 'dimension' });
  expect((await inspect(request, sent)).boundingBoxMm.z).toBeCloseTo(20, 3);

  // Edit Pad.1: back to one side, 15 mm, plus a 5 mm second limit.
  await page.locator('.tree-row', { hasText: 'Pad.1' }).click();
  await expect(page.locator('.apply-property')).toContainText('Update Pad.1');
  await page.locator('.property-check:visible', { hasText: 'Mirrored extent' }).locator('input').uncheck();
  await field(page, 'Length (mm)').fill('15');
  await page.locator('.property-check:visible', { hasText: 'Second limit' }).locator('input').check();
  await field(page, 'Second limit length').fill('5');
  sent = await apply(page);
  expect(sent.features).toHaveLength(1);
  expect(sent.features[0]).toMatchObject({ depth: 15, depth2: 5 });
  expect((await inspect(request, sent)).volumeMm3).toBeCloseTo(100 * 20, 0);
});

test('counterbored hole at a sketched circle, on top of the pad', async ({ page, request }) => {
  await plane(page, 'Top');
  await rect(page, 0, 0, 40, 30);
  await designTab(page); await tool3d(page, 'Pad');
  await apply(page);
  // The Top plane's offset rose to the pad's top face (20).
  await sketchTab(page); await plane(page, 'Top'); await circle(page, 20, 15, 5);
  await designTab(page); await tool3d(page, 'Hole');
  await expect(field(page, 'Sketch plane offset')).toHaveValue('20');
  await field(page, 'Type').selectOption('counterbored');
  const sent = await apply(page);
  expect(sent.features[1]).toMatchObject({ op: 'hole', hole: { type: 'counterbored', depth: 20, cbDiameter: 16, cbDepth: 5 } });
  const removed = Math.PI * 8 * 8 * 5 + Math.PI * 5 * 5 * 15;
  expect((await inspect(request, sent)).volumeMm3).toBeCloseTo(40 * 30 * 20 - removed, -1);
});

test('Rib: circle on Right swept along a kept center curve drawn on Front', async ({ page, request }) => {
  await polyline(page, [[0, 0], [60, 0]]);             // Front: open line along +X
  await designTab(page); await tool3d(page, 'Keep Sketch');
  await page.locator('.apply-property').click();
  await expect(page.locator('.tree-row', { hasText: 'Sketch.1 (Front, open chain)' })).toBeVisible();
  await sketchTab(page); await plane(page, 'Right');
  await circle(page, 0, 0, 5);
  await designTab(page); await tool3d(page, 'Rib');
  await field(page, 'Center curve').selectOption({ label: 'Sketch.1 — open chain (Front)' });
  const sent = await apply(page);
  // The center curve went from the Front sketch into 3D along +X.
  const path = sent.features[0].path as { start: number[]; segments: { kind: string; end: number[] }[] };
  expect(sent.features[0].op).toBe('rib');
  expect(path.start).toEqual([0, 0, 0]);
  expect(path.segments[0].kind).toBe('line');
  expect(path.segments[0].end[0]).toBeCloseTo(60, 0);
  expect(path.segments[0].end.slice(1)).toEqual([0, 0]);
  expect((await inspect(request, sent)).volumeMm3).toBeCloseTo(Math.PI * 25 * path.segments[0].end[0], -1);
});

test('Stiffener fills an L-bracket corner from an open line', async ({ page, request }) => {
  await plane(page, 'Top');
  await polyline(page, [[0, 0], [50, 0], [50, 10], [10, 10], [10, 50], [0, 50], [0, 0]]);
  await designTab(page); await tool3d(page, 'Pad');
  await apply(page);
  await sketchTab(page); await plane(page, 'Top'); await polyline(page, [[10, 40], [40, 10]]);
  await designTab(page); await tool3d(page, 'Stiffener');
  await field(page, 'Sketch plane offset').fill('10');
  const sent = await apply(page);
  expect(sent.features[1]).toMatchObject({ op: 'stiffener', thickness: 4, mirrored: true });
  // Mouse clicks land within a fraction of a mm, so compare against the
  // geometry actually sent: the web is the triangle between the line
  // x + y = c and the bracket's inner walls, times the thickness.
  const [ox, oy] = [0, 0];                              // profiles are sketch-local
  const corner = (sent.features[0].loops as { points: number[][] }[])[0].points[3];
  const [cx, cy] = [corner[0] - ox, corner[1] - oy];
  const start = (sent.features[1].openPath as { start: number[] }).start;
  const c = start[0] - ox + (start[1] - oy);
  const base = (await inspect(request, { features: [sent.features[0]], modifiers: [] })).volumeMm3;
  const added = (await inspect(request, sent)).volumeMm3 - base;
  expect(added).toBeCloseTo(0.5 * (c - cx - cy) ** 2 * 4, -1);
});

test('Edge Fillet on a face picked in the viewport', async ({ page, request }) => {
  await plane(page, 'Top');
  await rect(page, -20, -20, 40, 40);
  await designTab(page); await tool3d(page, 'Pad');
  const padded = await apply(page);
  await page.waitForTimeout(800);
  await tool3d(page, 'Edge Fillet');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const box = (await page.locator('.model-viewport canvas').first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.pd-face-row')).toHaveCount(1);
  const sent = await apply(page);
  expect(sent.modifiers[0]).toMatchObject({ op: 'fillet', radius: 2 });
  expect((sent.modifiers[0].facePoints as number[][]).length).toBe(1);
  const before = (await inspect(request, padded)).volumeMm3, after = (await inspect(request, sent)).volumeMm3;
  expect(after).toBeLessThan(before);
  await expect(page.locator('.tree-row', { hasText: 'Edge Fillet.1' })).toBeVisible();
});

test('transformations: rectangular pattern in two directions and a split', async ({ page, request }) => {
  await plane(page, 'Top');
  await rect(page, 0, 0, 10, 10);
  await designTab(page); await tool3d(page, 'Pad');
  await field(page, 'Length (mm)').fill('10');
  await apply(page);
  await tool3d(page, 'Rectangular Pattern');
  await page.locator('.property-check:visible', { hasText: 'Second direction' }).locator('input').check();
  let sent = await apply(page);
  expect(sent.modifiers[0]).toMatchObject({ op: 'linear_pattern_body', axis: 'X', count: 3, spacing: 30, axis2: 'Y', count2: 2 });
  expect((await inspect(request, sent)).volumeMm3).toBeCloseTo(6 * 1000, 0);
  await tool3d(page, 'Split');
  await field(page, 'Offset along').fill('4');
  sent = await apply(page);
  expect(sent.modifiers[1]).toMatchObject({ op: 'split_body', keep: '+', planeSpec: { origin: [0, 0, 4], normal: [0, 0, 1] } });
  expect((await inspect(request, sent)).boundingBoxMm.z).toBeCloseTo(6, 3);
});

test('Insert Body + Remove: a second body subtracted from PartBody', async ({ page, request }) => {
  await plane(page, 'Top');
  await rect(page, 0, 0, 40, 30);
  await designTab(page); await tool3d(page, 'Pad');
  await apply(page);
  await tool3d(page, 'Insert Body');
  await page.locator('.apply-property').click();
  await expect(page.locator('.tree-row', { hasText: 'Body.2' })).toContainText('active');
  await sketchTab(page); await plane(page, 'Top'); await circle(page, 20, 15, 5);
  await designTab(page); await tool3d(page, 'Pad');
  await field(page, 'Sketch plane offset').fill('-5');
  await field(page, 'Length (mm)').fill('30');
  await apply(page, '/build_bodies');
  await tool3d(page, 'Remove');
  await field(page, 'Body').selectOption({ label: 'Body.2' });
  const done = page.waitForResponse((r) => r.url().includes('/build_bodies'));
  await page.locator('.apply-property').click();
  const res = await done;
  expect(res.status(), await res.text()).toBe(200);
  const body = JSON.parse(res.request().postData() ?? '{}');
  expect(body.operations).toEqual([expect.objectContaining({ op: 'remove', tool: body.bodies[1].id, target: 'PartBody' })]);
  const r = await request.post(`${API}/build_bodies`, { data: { ...body, format: 'inspect' } });
  const out = await r.json();
  expect(out.bodies.PartBody.volumeMm3).toBeCloseTo(40 * 30 * 20 - Math.PI * 25 * 20, -1);
  await expect(page.locator('.tree-row', { hasText: 'Remove.1' })).toBeVisible();
});

test('Save and Open keep modifiers, kept sketches and plane offsets', async ({ page, request }) => {
  const name = `pd-e2e-${Date.now()}`;
  page.on('dialog', (d) => void d.accept(name));
  await plane(page, 'Top');
  await rect(page, 0, 0, 20, 20);
  await designTab(page); await tool3d(page, 'Pad');
  await apply(page);
  await tool3d(page, 'Shell');
  await apply(page);
  const saved = page.waitForResponse((r) => r.url().includes(`/projects/${name}`) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const payload = JSON.parse((await saved).request().postData() ?? '{}');
  expect(payload.threeD.modifiers).toHaveLength(1);
  expect(payload.threeD.planeOffsets.Top).toBe(20);
  try {
    await page.goto('/');
    await page.getByRole('button', { name: /^Front Plane/ }).click();
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    const rebuilt = page.waitForResponse((r) => r.url().includes('/build_part'));
    await page.locator('.projects-row', { hasText: name }).click();
    const sent = JSON.parse((await rebuilt).request().postData() ?? '{}');
    expect(sent.modifiers).toHaveLength(1);
    expect(sent.modifiers[0].op).toBe('shell');
    await designTab(page);
    await expect(page.locator('.tree-row', { hasText: 'Shell.1' })).toBeVisible();
  } finally {
    await request.delete(`${API}/projects/${name}`);
  }
});

test('Shaft about the Front sketch V axis (world Z), then a Groove', async ({ page, request }) => {
  await rect(page, 10, 0, 10, 20);                      // Front: x 10..20, z 0..20
  await designTab(page); await tool3d(page, 'Shaft');
  await field(page, 'Axis').selectOption('Y');          // sketch V axis
  let sent = await apply(page);
  expect(sent.features[0]).toMatchObject({ op: 'revolve', axis: 'Y', angle: 360 });
  const ring = Math.PI * (20 ** 2 - 10 ** 2) * 20;
  expect((await inspect(request, sent)).volumeMm3).toBeCloseTo(ring, -1);
  await sketchTab(page); await plane(page, 'Front');
  await rect(page, 15, 5, 5, 5);                        // a 5×5 groove in the outer wall
  await designTab(page); await tool3d(page, 'Groove');
  await field(page, 'Axis').selectOption('Y');
  sent = await apply(page);
  expect(sent.features[1].op).toBe('groove');
  expect((await inspect(request, sent)).volumeMm3).toBeCloseTo(ring - Math.PI * (20 ** 2 - 15 ** 2) * 5, -1);
});

test('Draft on the side faces; Thread refuses a planar face; Delete from the tree', async ({ page, request }) => {
  await plane(page, 'Top');
  await rect(page, -10, -10, 20, 20);
  await designTab(page); await tool3d(page, 'Pad');
  await apply(page);
  await tool3d(page, 'Draft');
  const sent = await apply(page);
  expect(sent.modifiers[0]).toMatchObject({ op: 'draft', draftAngle: 5, pullDirection: [0, 0, 1], faceSelector: 'side' });
  // Neutral at the bottom, 5° inward: a frustum with a 20 − 2·20·tan5° top.
  const t = 20 - 2 * 20 * Math.tan((5 * Math.PI) / 180);
  expect((await inspect(request, sent)).volumeMm3).toBeCloseTo((20 / 3) * (400 + t * t + 20 * t), -1);

  await tool3d(page, 'Thread/Tap');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const box = (await page.locator('.model-viewport canvas').first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.pd-face-row')).toHaveCount(1);
  await expect(page.locator('.pd-face-row')).toContainText('planar');
  await page.locator('.apply-property').click();
  await expect(page.locator('.app-toast')).toContainText('cylindrical');
  await expect(page.locator('.tree-row', { hasText: 'Thread/Tap.1' })).toHaveCount(0);   // not kept

  const rebuilt = page.waitForResponse((r) => r.url().includes('/build_part'));
  await page.locator('.tree-row-wrap', { hasText: 'Draft.1' }).hover();
  await page.getByRole('button', { name: 'Delete Draft.1' }).click();
  expect(JSON.parse((await rebuilt).request().postData() ?? '{}').modifiers).toHaveLength(0);
  await expect(page.locator('.tree-row', { hasText: 'Draft.1' })).toHaveCount(0);
});

test('a project saved before this change (XY stack, canvas loops) rebuilds exactly as before', async ({ page, request }) => {
  const name = `pd-legacy-${Date.now()}`;
  // What the previous App.tsx saved: no plane, no extra options, canvas-space loops, stackTop.
  const legacy = { id: 'feat_1', name: 'Pad 001', op: 'pad', depth: 20, zOffset: 0, loops: [{ kind: 'polygon', points: [[200, -150], [240, -150], [240, -120], [200, -120]] }] };
  const oldWire = { id: 'feat_1', op: 'pad', zOffset: 0, depth: 20, loops: legacy.loops, axis: 'X', angle: 360 };
  await request.post(`${API}/projects/${name}`, { data: { workspace: '3D Design', sketch: null, threeD: { features: [legacy], stackTop: 20, sketchSupport: null } } });
  try {
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    const rebuilt = page.waitForResponse((r) => r.url().includes('/build_part'));
    await page.locator('.projects-row', { hasText: name }).click();
    const res = await rebuilt;
    expect(res.status()).toBe(200);
    const sent = JSON.parse(res.request().postData() ?? '{}');
    expect(sent.features).toEqual([oldWire]);           // byte-for-byte the old request
    const d = await inspect(request, sent);
    expect(d.volumeMm3).toBeCloseTo(40 * 30 * 20, 0);
    expect(d.boundingBoxMm.z).toBeCloseTo(20, 3);
    // It shows in the tree and opens for Delete only (no stored definition).
    await page.locator('.tree-row', { hasText: 'Pad 001' }).click();
    await expect(page.locator('.sketch-notice')).toContainText('only Delete');
  } finally {
    await request.delete(`${API}/projects/${name}`);
  }
});
