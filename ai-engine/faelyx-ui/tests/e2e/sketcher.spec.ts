import { expect, test } from '@playwright/test';
import { click, dblclick, drag, esc, input, lineCoords, openSketch, svg, tool, toScreen, variant } from './helpers';

// Walkthrough of the CATIA "Drawing Sketches in the Sketcher Workbench-I"
// features (docs/reference/changes/2026-09-28-drawing-2d.md).

test.beforeEach(async ({ page }) => { await openSketch(page); });

test('three point arcs follow the guide click order', async ({ page }) => {
  await variant(page, 'Arc', '3-Point Arc');
  await click(page, 150, 150); await click(page, 200, 100); await click(page, 250, 150);
  const mid = await page.$$eval('svg.sketch-svg path.sketch-arc', (ps) => { const p = ps[0] as SVGPathElement; const m = p.getPointAtLength(p.getTotalLength() / 2); return [m.x, m.y]; });
  expect(mid[0]).toBeCloseTo(200, 0); expect(mid[1]).toBeCloseTo(100, 0);
});

test('typed line, length + angle, and symmetrical extension', async ({ page }) => {
  await tool(page, 'Line');
  await input(page, 'Start H (mm)').fill('0'); await input(page, 'V (mm)').fill('0'); await input(page, 'V (mm)').press('Enter');
  await input(page, 'End H').fill('50'); await input(page, 'V').fill('30'); await input(page, 'V').press('Enter');
  expect(await lineCoords(page)).toContainEqual([200, 150, 250, 120]);
  await input(page, 'Start H (mm)').fill('-100'); await input(page, 'V (mm)').fill('-100'); await input(page, 'V (mm)').press('Enter');
  await input(page, 'Angle (°)').fill('90'); await input(page, 'Length (mm)').fill('20'); await input(page, 'Length (mm)').press('Enter');
  const l = (await lineCoords(page)).at(-1)!;
  expect(l[0]).toBeCloseTo(100); expect(l[1]).toBeCloseTo(250); expect(l[3]).toBeCloseTo(230);
  await page.locator('.anchor-toggle', { hasText: 'Symmetrical:' }).getByRole('button', { name: 'On' }).click();
  await click(page, 100, 200); await click(page, 130, 200);
  const s = (await lineCoords(page)).at(-1)!;
  expect(s[0] + s[2]).toBeCloseTo(200, 0);
});

test('typed rectangle is fully constrained and turns green after the solve', async ({ page }) => {
  await tool(page, 'Rectangle');
  await input(page, 'Corner H (mm)').fill('0'); await input(page, 'V (mm)').fill('0');
  await input(page, 'Width').fill('40'); await input(page, 'Height').fill('20'); await input(page, 'Height').press('Enter');
  await expect(page.locator('.dof-badge')).toContainText('DOF: 0');
  await expect(page.locator('svg.sketch-svg line.sketch-line.sketch-fixed')).toHaveCount(4);
});

test('profile with a tangent arc closes, solves, and pads into a real solid', async ({ page }) => {
  await variant(page, 'Rectangle', 'General Profile');
  await click(page, 200, 150); await click(page, 240, 150);
  await page.getByRole('button', { name: 'Tangent Arc', exact: true }).click();
  await click(page, 240, 110);
  await click(page, 200, 110); await click(page, 200, 150);
  await expect(page.locator('svg.sketch-svg path.sketch-arc')).toHaveCount(1);
  await expect(page.locator('.live-dim-hint')).toContainText('Click the start point');
  await expect(page.locator('.dof-badge')).not.toContainText('Solving');
  // 3D Design: Extrude the line+arc profile through Open Cascade.
  await page.locator('.workspace-nav button', { hasText: '3D Design' }).click();
  await page.locator('.tool-item').filter({ has: page.locator('span:text-is("Pad")') }).first().click();
  await page.locator('.inspector-tabs button', { hasText: 'PROPERTIES' }).click();
  const build = page.waitForResponse((r) => r.url().includes('/build_part'));
  await page.getByRole('button', { name: /Apply changes/ }).click();
  const res = await build;
  // The profile went over as one line+arc path, not just straight lines.
  const sent = JSON.parse(res.request().postData() ?? '{}');
  const loop = sent.features[0].loops[0];
  expect(loop.kind).toBe('path');
  expect(loop.segments.filter((sg: { kind: string }) => sg.kind === 'arc')).toHaveLength(1);
  expect(res.status()).toBe(200);
  expect((await res.body()).length).toBeGreaterThan(1000);
});

test('tangency inference snaps a line onto a circle with a tangent constraint', async ({ page }) => {
  await tool(page, 'Circle');
  await input(page, 'Center H (mm)').fill('50'); await input(page, 'V (mm)').fill('0'); await input(page, 'R (mm)').fill('20'); await input(page, 'R (mm)').press('Enter');
  await esc(page);
  await tool(page, 'Line');
  await click(page, 200, 150);
  // Tangent point from (200,150) to circle centered (250,150) r 20 (upper one).
  const d = 50, r = 20, alpha = Math.acos(r / d), phi = Math.PI;
  const T = { x: 250 + r * Math.cos(phi - alpha), y: 150 + r * Math.sin(phi - alpha) };
  await click(page, T.x + 0.8, T.y + 0.8);
  await expect(page.locator('.constraint-row', { hasText: 'Tangent' })).toHaveCount(1);
});

test('infinite, bisecting and bi-tangent lines', async ({ page }) => {
  await variant(page, 'Line', 'Infinite Line');
  await click(page, 0, 280);
  await expect(page.locator('line.sketch-line-infinite')).toHaveCount(1);
  await esc(page);
  await tool(page, 'Circle');
  for (const [h, v, r] of [['-150', '80', '15'], ['-80', '80', '10']]) {
    await input(page, 'Center H (mm)').fill(h); await input(page, 'V (mm)').fill(v); await input(page, 'R (mm)').fill(r); await input(page, 'R (mm)').press('Enter');
  }
  await esc(page);
  await variant(page, 'Line', 'Bi-Tangent Line');
  await click(page, 50, 55); await click(page, 120, 60);
  const bt = (await lineCoords(page)).at(-1)!;
  expect(bt[1]).toBeCloseTo(55, 0); expect(bt[3]).toBeCloseTo(60, 0);
});

test('selection traps', async ({ page }) => {
  await tool(page, 'Line');
  await click(page, 200, 150); await click(page, 250, 120);
  await esc(page);
  await page.getByRole('button', { name: 'Intersecting Trap' }).click();
  await drag(page, [230, 110], [240, 160]);
  expect(await page.locator('svg.sketch-svg .sketch-selected').count()).toBeGreaterThan(0);
  await esc(page);
  await page.getByRole('button', { name: 'Selection Trap' }).click();
  await drag(page, [230, 110], [240, 160]);
  await expect(page.locator('svg.sketch-svg .sketch-selected')).toHaveCount(0);
  await page.getByRole('button', { name: 'Polygon Trap' }).click();
  await click(page, 190, 110); await click(page, 260, 110); await click(page, 260, 160); await dblclick(page, 190, 160);
  expect(await page.locator('svg.sketch-svg .sketch-selected').count()).toBeGreaterThanOrEqual(3);
});

test('view tools: zoom, fit all, normal view reverse keeps clicks accurate', async ({ page }) => {
  const vb = async () => (await svg(page).getAttribute('viewBox'))!.split(' ').map(Number);
  const v0 = await vb();
  await page.getByLabel('Zoom In', { exact: true }).click();
  expect((await vb())[2]).toBeLessThan(v0[2]);
  await page.getByLabel('Normal View').click();
  await expect(svg(page)).toHaveClass(/sketch-view-flipped/);
  await tool(page, 'Point');
  await click(page, 170, 130);
  const plus = page.locator('g.sketch-point-plus path').last();
  await expect(plus).toHaveAttribute('d', /M 16\d/);
});

test('hide/show tool and swap visible space', async ({ page }) => {
  await tool(page, 'Circle');
  await input(page, 'Center H (mm)').fill('0'); await input(page, 'V (mm)').fill('0'); await input(page, 'R (mm)').fill('20'); await input(page, 'R (mm)').press('Enter');
  await esc(page);
  await page.getByLabel('Hide/Show').click();
  await click(page, 200, 170);
  await expect(page.locator('svg.sketch-svg circle.sketch-circle')).toHaveCount(0);
  await page.getByLabel('Swap Visible Space').click();
  await expect(svg(page)).toHaveClass(/sketch-swap-space/);
  await expect(page.locator('svg.sketch-svg circle.sketch-circle')).toHaveCount(1);
});

test('circle definition dialog, units and sketch positioning', async ({ page }) => {
  await variant(page, 'Circle', 'Coordinate Circle');
  const dialog = page.locator('.sketch-dialog', { hasText: 'Circle Definition' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Center H (mm)').fill('10');
  await dialog.getByLabel('Radius (mm)').fill('5');
  await dialog.getByRole('button', { name: 'OK' }).click();
  const c = page.locator('svg.sketch-svg circle.sketch-circle');
  await expect(c).toHaveAttribute('cx', '210'); await expect(c).toHaveAttribute('r', '5');
  // Units: inches.
  await esc(page);
  await page.getByRole('button', { name: /Style/ }).click();
  await page.locator('.appearance-row', { hasText: 'Length unit' }).locator('select').selectOption('in');
  await page.locator('.appearance-panel-head button[aria-label="Close"]').click();
  await tool(page, 'Circle');
  await expect(input(page, 'R (in)')).toBeVisible();
  // Sketch Positioning dialog stores an offset.
  await page.getByLabel('Sketch Positioning').click();
  const pos = page.locator('.sketch-dialog', { hasText: 'Sketch Positioning' });
  await pos.locator('input[name="ang"]').fill('30');
  await pos.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByLabel('Sketch Positioning')).toHaveClass(/viewport-text-action-on/);
});

test('distance from the sketch Origin via the tree and constraint tools', async ({ page }) => {
  await tool(page, 'Point');
  await click(page, 230, 110);
  await esc(page);
  await page.getByRole('button', { name: 'Origin', exact: true }).click();
  const p = await toScreen(page, 230, 110);
  await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Shift');
  await page.locator('.tool-item').filter({ has: page.locator('span:text-is("Distance")') }).click();
  await page.locator('.live-dim input').first().fill('30');
  await page.locator('.live-dim input').first().press('Enter');
  await expect(page.locator('.constraint-row', { hasText: '__origin' })).toHaveCount(1);
  // Solved: the point now sits 30 from the origin.
  await expect.poll(async () => page.$$eval('g.sketch-point-plus path', (ps) => {
    const m = (ps.at(-1)!.getAttribute('d') ?? '').match(/M ([\d.-]+) ([\d.-]+)/)!;
    const k = 3; const x = Number(m[1]) + k, y = Number(m[2]);
    return Math.hypot(x - 200, y - 150);
  })).toBeCloseTo(30, 1);
});

test('sketch on a picked face of the part builds the next pad on that face', async ({ page }) => {
  // First solid: a 40 x 30 rectangle padded 20.
  await tool(page, 'Rectangle');
  await input(page, 'Corner H (mm)').fill('0'); await input(page, 'V (mm)').fill('0');
  await input(page, 'Width').fill('40'); await input(page, 'Height').fill('30'); await input(page, 'Height').press('Enter');
  await page.locator('.workspace-nav button', { hasText: '3D Design' }).click();
  await page.locator('.tool-item').filter({ has: page.locator('span:text-is("Pad")') }).first().click();
  await page.locator('.inspector-tabs button', { hasText: 'PROPERTIES' }).click();
  const first = page.waitForResponse((r) => r.url().includes('/build_part'));
  await page.getByRole('button', { name: /Apply changes/ }).click();
  expect((await first).status()).toBe(200);
  await page.waitForTimeout(800);
  // Pick a face: Select mode, click the middle of the part in the viewport.
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const canvas = page.locator('.model-viewport canvas').first();
  const box = (await canvas.boundingBox())!;
  const pencil = page.locator('.navigation-bar button[aria-label^="Sketch on"]');
  await expect(pencil).toBeDisabled();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  // The backend confirms the face is planar before the button enables.
  await expect(page.locator('.face-chip-planar')).toBeVisible();
  await expect(pencil).toBeEnabled();
  await pencil.click();
  await expect(page.locator('.workspace-nav button.workspace-active')).toContainText('Sketch');
  // The face's 4 edges were projected in as construction lines, and the tab shows the support.
  await expect(page.locator('line.sketch-line-construction')).toHaveCount(4);
  await expect(page.locator('.plane-switcher button', { hasText: 'On face' })).toBeVisible();
  // A small square on that face, then pad it.
  await tool(page, 'Rectangle');
  await input(page, 'Corner H (mm)').fill('-5'); await input(page, 'V (mm)').fill('-5');
  await input(page, 'Width').fill('10'); await input(page, 'Height').fill('10'); await input(page, 'Height').press('Enter');
  await page.locator('.workspace-nav button', { hasText: '3D Design' }).click();
  await page.locator('.tool-item').filter({ has: page.locator('span:text-is("Pad")') }).first().click();
  await page.locator('.inspector-tabs button', { hasText: 'PROPERTIES' }).click();
  const second = page.waitForResponse((r) => r.url().includes('/build_part'));
  await page.getByRole('button', { name: /Apply changes/ }).click();
  const res = await second;
  const sent = JSON.parse(res.request().postData() ?? '{}');
  expect(sent.features).toHaveLength(2);
  expect(sent.features[1].plane).toBeTruthy();
  expect(res.status()).toBe(200);
});

test('a curved face keeps Sketch on Face disabled and says why', async ({ page }) => {
  await tool(page, 'Circle');
  await input(page, 'Center H (mm)').fill('0'); await input(page, 'V (mm)').fill('0'); await input(page, 'R (mm)').fill('20'); await input(page, 'R (mm)').press('Enter');
  await page.locator('.workspace-nav button', { hasText: '3D Design' }).click();
  await page.locator('.tool-item').filter({ has: page.locator('span:text-is("Pad")') }).first().click();
  await page.locator('.inspector-tabs button', { hasText: 'PROPERTIES' }).click();
  const built = page.waitForResponse((r) => r.url().includes('/build_part'));
  await page.getByRole('button', { name: /Apply changes/ }).click();
  expect((await built).status()).toBe(200);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  // Fit so the cylinder fills the view, then click near its silhouette edge (the curved side).
  await page.getByRole('button', { name: 'Fit all' }).click();
  await page.waitForTimeout(300);
  const box = (await page.locator('.model-viewport canvas').first().boundingBox())!;
  const pencil = page.locator('.navigation-bar button[aria-label^="Sketch on"], .navigation-bar button[aria-label^="Can"]');
  // Scan a horizontal line for a hit on the curved face.
  let sawCurved = false;
  for (let f = 0.52; f < 0.9 && !sawCurved; f += 0.04) {
    await page.mouse.click(box.x + box.width * f, box.y + box.height * 0.62);
    await page.waitForTimeout(250);
    sawCurved = await page.locator('.face-chip-not-planar').isVisible();
  }
  expect(sawCurved).toBe(true);
  await expect(page.locator('.face-chip-not-planar')).toContainText('cylinder');
  await expect(pencil.first()).toBeDisabled();
});

test('bi-tangent line on two ellipses is solved as a real tangency', async ({ page }) => {
  await tool(page, 'Ellipse');
  await click(page, 140, 150); await click(page, 170, 150); await click(page, 140, 135);
  await click(page, 260, 150); await click(page, 290, 150); await click(page, 260, 135);
  await esc(page);
  await expect(page.locator('svg.sketch-svg path.sketch-curve')).toHaveCount(2);
  await variant(page, 'Line', 'Bi-Tangent Line');
  await click(page, 140, 135); await click(page, 260, 135);
  await expect(page.locator('.constraint-row', { hasText: 'Tangent' })).toHaveCount(2);
  // The solver accepted the ellipse tangencies: status is a normal solve, not an error.
  await expect(page.locator('.dof-badge')).toContainText('DOF:');
  await expect(page.locator('.dof-badge')).not.toContainText('Over-constrained');
  const top = (await lineCoords(page)).at(-1)!;
  expect(top[1]).toBeCloseTo(135, 0); expect(top[3]).toBeCloseTo(135, 0);
});

// Rectangle corners are at canvas (200,150)-(240,150)-(240,130)-(200,130) for
// Corner H/V 0,0 and Width 40, Height 20 (V up = canvas y down).
async function typedRect(page: import('@playwright/test').Page, w = '40', h = '20') {
  await tool(page, 'Rectangle');
  await input(page, 'Corner H (mm)').fill('0'); await input(page, 'V (mm)').fill('0');
  await input(page, 'Width').fill(w); await input(page, 'Height').fill(h); await input(page, 'Height').press('Enter');
  await esc(page);
}
async function padAndGetLoops(page: import('@playwright/test').Page) {
  await page.locator('.workspace-nav button', { hasText: '3D Design' }).click();
  await page.locator('.tool-item').filter({ has: page.locator('span:text-is("Pad")') }).first().click();
  await page.locator('.inspector-tabs button', { hasText: 'PROPERTIES' }).click();
  const build = page.waitForResponse((r) => r.url().includes('/build_part'));
  await page.getByRole('button', { name: /Apply changes/ }).click();
  const res = await build;
  expect(res.status()).toBe(200);
  return JSON.parse(res.request().postData() ?? '{}').features.at(-1).loops as { kind: string; points?: number[][]; segments?: { kind: string }[] }[];
}

test('chamfering a rectangle corner keeps the other corners (no trapezium)', async ({ page }) => {
  await typedRect(page);
  await tool(page, 'Chamfer');
  await page.locator('.anchor-toggle button', { hasText: 'Two lengths' }).click();
  await input(page, 'Distance A (mm)').fill('5'); await input(page, 'Distance B (mm)').fill('5');
  await click(page, 220, 150); await click(page, 240, 140); // bottom edge, then right edge near corner (240,150)
  await expect(page.locator('svg.sketch-svg line.sketch-line')).toHaveCount(5);
  const loops = await padAndGetLoops(page);
  expect(loops).toHaveLength(1);
  expect(loops[0].kind).toBe('polygon');
  expect(loops[0].points).toHaveLength(5);
  // The chamfer cut lands 5 from the corner on both edges; the far corners are untouched.
  // Pad profiles are sketch-local (origin marker at canvas 200,150, V up): back to canvas.
  const pts = loops[0].points!.map(([x, y]) => `${Math.round(x + 200)},${Math.round(150 - y)}`);
  expect(pts).toEqual(expect.arrayContaining(['235,150', '240,145', '200,150', '200,130', '240,130']));
});

test('chamfer with length + angle (the default mode): angle shown live and kept as a dimension', async ({ page }) => {
  await typedRect(page);
  await tool(page, 'Chamfer');
  // Length + angle is the default, with its Angle field visible straight away.
  await expect(page.locator('.anchor-toggle button.anchor-active', { hasText: 'Length + angle' })).toBeVisible();
  await expect(input(page, 'Angle (°)')).toHaveValue('45');
  await input(page, 'First length (mm)').fill('10'); await input(page, 'Angle (°)').fill('30');
  await click(page, 220, 150);
  // Hovering the second element previews the chamfer with its length and angle.
  const hover = await toScreen(page, 240, 140);
  await page.mouse.move(hover.x, hover.y);
  await expect(page.locator('svg.sketch-svg text.sketch-preview-label', { hasText: '30.0°' })).toBeVisible();
  await click(page, 240, 140);
  // After applying: an angle constraint, and the angle dimension on the canvas.
  await expect(page.locator('.constraint-row', { hasText: 'Chamfer angle' })).toContainText('30.0°');
  await expect(page.locator('svg.sketch-svg .dim-annotation text', { hasText: /^30(\.0)?$/ })).toBeVisible();
  const chamfer = (await lineCoords(page)).at(-1)!; // the chamfer line is the newest
  // From (230,150), 30° off the bottom edge toward the right edge (x=240): rises 10·tan30.
  const other = Math.abs(chamfer[0] - 230) < 1e-6 ? [chamfer[2], chamfer[3]] : [chamfer[0], chamfer[1]];
  expect(other[0]).toBeCloseTo(240, 3); expect(other[1]).toBeCloseTo(150 - 10 * Math.tan(Math.PI / 6), 3);
});

test('trim cuts a circle between its crossings instead of deleting it', async ({ page }) => {
  await tool(page, 'Circle');
  await input(page, 'Center H (mm)').fill('0'); await input(page, 'V (mm)').fill('0'); await input(page, 'R (mm)').fill('20'); await input(page, 'R (mm)').press('Enter');
  await esc(page);
  await tool(page, 'Line');
  await click(page, 170, 150); await click(page, 230, 150);
  await esc(page);
  await tool(page, 'Trim');
  await click(page, 200, 130); // top of the circle
  await expect(page.locator('svg.sketch-svg circle.sketch-circle')).toHaveCount(0);
  await expect(page.locator('svg.sketch-svg path.sketch-arc')).toHaveCount(1);
  const mid = await page.$eval('svg.sketch-svg path.sketch-arc', (p) => { const e = p as SVGPathElement; const m = e.getPointAtLength(e.getTotalLength() / 2); return [m.x, m.y]; });
  expect(mid[1]).toBeGreaterThan(160); // the kept half is the bottom one
});

test('a T-junction inside a rectangle still pads as one outline', async ({ page }) => {
  await typedRect(page);
  await tool(page, 'Line');
  await click(page, 220, 150); await click(page, 220, 130); // snaps onto both edges' midpoints
  await esc(page);
  const loops = await padAndGetLoops(page);
  expect(loops).toHaveLength(1);
});

test('keyhole pads as one line + arc outline', async ({ page }) => {
  await variant(page, 'Rectangle', 'Keyhole Profile');
  await click(page, 180, 150); await click(page, 230, 150); await click(page, 230, 135);
  await expect(page.locator('svg.sketch-svg path.sketch-arc')).toHaveCount(2);
  const loops = await padAndGetLoops(page);
  expect(loops).toHaveLength(1);
  expect(loops[0].kind).toBe('path');
  expect(loops[0].segments!.filter((s) => s.kind === 'arc')).toHaveLength(2);
});

test('3D chamfer with length + angle on curved edges', async ({ page }) => {
  await tool(page, 'Circle');
  await input(page, 'Center H (mm)').fill('0'); await input(page, 'V (mm)').fill('0'); await input(page, 'R (mm)').fill('20'); await input(page, 'R (mm)').press('Enter');
  await esc(page);
  await padAndGetLoops(page);
  await page.locator('.tool-item:visible').filter({ has: page.locator('span:text-is("Chamfer")') }).first().click();
  // Choosing the tool opens Properties, already in Length + angle with its Angle field.
  await expect(page.locator('.property-input', { hasText: 'Chamfer mode' }).locator('select')).toHaveValue('angle');
  await expect(page.locator('.property-input', { hasText: 'Angle (°)' }).locator('input')).toHaveValue('45');
  await page.locator('.property-input', { hasText: 'Edges' }).locator('select').selectOption('curved');
  await page.locator('.property-input', { hasText: 'Length 1' }).locator('input').fill('2');
  await page.locator('.property-input', { hasText: 'Angle (°)' }).locator('input').fill('30');
  await page.locator('.property-check input').check(); // Reverse: same bevel measured from the other face
  const build = page.waitForResponse((r) => r.url().includes('/build_part'));
  await page.getByRole('button', { name: /Apply changes/ }).click();
  const res = await build;
  const mod = JSON.parse(res.request().postData() ?? '{}').modifiers.at(-1);
  expect(mod).toMatchObject({ op: 'chamfer', edgeFilter: 'curved' });
  expect(mod.chamferAngle).toBeCloseTo(60);                       // 90 − 30
  expect(mod.radius).toBeCloseTo(2 * Math.tan(Math.PI / 6), 6);  // L·tan30
  expect(res.status()).toBe(200);
});

const curvePath = (page: import('@playwright/test').Page) => page.$$eval('svg.sketch-svg path.sketch-curve', (ps) => ps.map((p) => {
  const e = p as SVGPathElement; const L = e.getTotalLength(); const m = e.getPointAtLength(L / 2);
  return { len: L, mid: [m.x, m.y], d: e.getAttribute('d') ?? '' };
}));

test('trim cuts an ellipse to the elliptical arc that remains', async ({ page }) => {
  await tool(page, 'Ellipse');
  await click(page, 200, 150); await click(page, 240, 150); await click(page, 200, 130);
  await esc(page);
  await tool(page, 'Line'); await click(page, 150, 150); await click(page, 250, 150); await esc(page);
  const full = (await curvePath(page))[0];
  await tool(page, 'Trim'); await click(page, 200, 130); // the top of the ellipse
  const after = await curvePath(page);
  expect(after).toHaveLength(1);
  expect(after[0].d.endsWith('Z')).toBe(false); // an open elliptical arc now
  expect(after[0].len).toBeLessThan(full.len * 0.6);
  expect(after[0].mid[1]).toBeGreaterThan(160); // the bottom half is kept
});

test('trim cuts a spline between two crossings', async ({ page }) => {
  await tool(page, 'Spline');
  await click(page, 150, 150); await click(page, 190, 120); await click(page, 230, 170); await dblclick(page, 270, 140);
  await esc(page);
  await tool(page, 'Line'); await click(page, 175, 100); await click(page, 175, 200); await esc(page);
  await tool(page, 'Line'); await click(page, 250, 100); await click(page, 250, 200); await esc(page);
  await tool(page, 'Trim'); await click(page, 210, 145);
  const after = await curvePath(page);
  expect(after).toHaveLength(2); // the two outer pieces remain
});

test('chamfer between a line and an ellipse', async ({ page }) => {
  await tool(page, 'Ellipse');
  await click(page, 200, 150); await click(page, 240, 150); await click(page, 200, 130);
  await esc(page);
  await tool(page, 'Line'); await click(page, 150, 150); await click(page, 280, 150); await esc(page); // crosses the ellipse
  const before = (await lineCoords(page))[0];
  await tool(page, 'Chamfer');
  await page.locator('.anchor-toggle button', { hasText: 'Two lengths' }).click();
  await input(page, 'Distance A (mm)').fill('10'); await input(page, 'Distance B (mm)').fill('8');
  await click(page, 180, 150); await click(page, 230, 138); // line (left, outside part kept) + upper right of ellipse
  const lc = await lineCoords(page);
  expect(lc).toHaveLength(2);
  const chamfer = lc.at(-1)!;
  const trimmed = lc[0];
  // The line now stops 10 short of where it met the ellipse (its right vertex, x ≈ 240).
  const rightEnd = Math.max(trimmed[0], trimmed[2]);
  expect(rightEnd).toBeLessThan(before[2] - 30);
  expect(Math.abs(rightEnd - 230)).toBeLessThan(0.6);
  // The chamfer runs from that cut to a point on the ellipse ~8 (chord) from the vertex, above the axis.
  const ends = [[chamfer[0], chamfer[1]], [chamfer[2], chamfer[3]]];
  expect(ends.some(([x2, y2]) => Math.abs(Math.hypot(x2 - (rightEnd + 10), y2 - 150) - 8) < 0.6 && y2 < 150)).toBe(true);
  // The ellipse became an open arc.
  const d = await page.$eval('svg.sketch-svg path.sketch-curve', (p) => p.getAttribute('d') ?? '');
  expect(d.endsWith('Z')).toBe(false);
});


test('chamfer refuses an angle that would run off the edge, and says why', async ({ page }) => {
  await typedRect(page);
  await tool(page, 'Chamfer');
  await input(page, 'First length (mm)').fill('10'); await input(page, 'Angle (°)').fill('70'); // 10·tan70 = 27.5 > the 20 edge
  const before = await lineCoords(page);
  await click(page, 220, 150);
  const hover = await toScreen(page, 240, 140);
  await page.mouse.move(hover.x, hover.y);
  await expect(page.locator('svg.sketch-svg text.sketch-preview-warning-text')).toContainText('use at most 63.4°');
  await click(page, 240, 140);
  await expect(page.locator('.live-dim-warning')).toContainText('runs past the end of the second element');
  expect(await lineCoords(page)).toEqual(before); // nothing changed
  // A length longer than the first edge is refused too.
  await input(page, 'First length (mm)').fill('45'); await input(page, 'Angle (°)').fill('30');
  await click(page, 220, 150); await click(page, 240, 140);
  await expect(page.locator('.live-dim-warning')).toContainText('longer than the first element reaches');
  expect(await lineCoords(page)).toEqual(before);
});

test('chamfer angle + hypotenuse: the chamfer line itself has the typed length', async ({ page }) => {
  await typedRect(page);
  await tool(page, 'Chamfer');
  await page.locator('.anchor-toggle button', { hasText: 'Angle + hypotenuse' }).click();
  await input(page, 'Hypotenuse (mm)').fill('10'); await input(page, 'Angle (°)').fill('30');
  await click(page, 220, 150); await click(page, 240, 140);
  const ch = (await lineCoords(page)).at(-1)!;
  expect(Math.hypot(ch[2] - ch[0], ch[3] - ch[1])).toBeCloseTo(10, 3);
  // From the corner (240,150): 10·cos30 back along the bottom, 10·sin30 up the side.
  const ends = [[ch[0], ch[1]], [ch[2], ch[3]]];
  expect(ends.some(([x, y]) => Math.abs(x - (240 - 10 * Math.cos(Math.PI / 6))) < 1e-3 && Math.abs(y - 150) < 1e-3)).toBe(true);
  expect(ends.some(([x, y]) => Math.abs(x - 240) < 1e-3 && Math.abs(y - (150 - 10 * Math.sin(Math.PI / 6))) < 1e-3)).toBe(true);
});
