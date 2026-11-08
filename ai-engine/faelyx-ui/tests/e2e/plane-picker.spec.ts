import { expect, test, type Page } from '@playwright/test';

// The "Select a plane to sketch on" overlay: the 3D planes graphic is
// scaled up to fill the overlay, and everything about it — hit areas,
// hover, labels, keyboard, the cards below — still lines up and works.

const cube = (page: Page) => page.locator('svg.iso-plane-cube');
async function openPicker(page: Page) {
  await page.goto('/');
  await expect(cube(page)).toBeVisible();
}
const activePlane = (page: Page) => page.locator('.plane-switcher button.plane-active');

test('the planes graphic is much larger, keeps its aspect ratio, and fits with the cards', async ({ page }) => {
  await openPicker(page);
  const box = (await cube(page).boundingBox())!;
  expect(box.width).toBeGreaterThan(260 * 1.6);                 // was a fixed 260 × 210 px
  const vb = await cube(page).evaluate((s: SVGSVGElement) => ({ width: s.viewBox.baseVal.width, height: s.viewBox.baseVal.height }));
  expect(box.width / box.height).toBeCloseTo(vb.width / vb.height, 2);
  // Nothing overlaps or spills: graphic above the cards, cards inside the overlay.
  const list = (await page.locator('.plane-picker-list').boundingBox())!;
  const picker = (await page.locator('.plane-picker').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(list.y);
  expect(list.y + list.height).toBeLessThanOrEqual(picker.y + picker.height);
  // Centred.
  expect(Math.abs(box.x + box.width / 2 - (picker.x + picker.width / 2))).toBeLessThan(2);
});

for (const size of [{ width: 1024, height: 640 }, { width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
  test(`fits and stays centred at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await openPicker(page);
    const box = (await cube(page).boundingBox())!;
    const list = (await page.locator('.plane-picker-list').boundingBox())!;
    const picker = (await page.locator('.plane-picker').boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(260);                // never smaller than the old fixed size
    expect(box.width).toBeLessThanOrEqual(640.5);
    expect(box.y + box.height).toBeLessThanOrEqual(list.y);
    expect(list.y + list.height).toBeLessThanOrEqual(picker.y + picker.height + 0.5);
    expect(Math.abs(box.x + box.width / 2 - (picker.x + picker.width / 2))).toBeLessThan(2);
  });
}

test('hit-testing matches the drawn planes everywhere on the scaled graphic', async ({ page }) => {
  await openPicker(page);
  const result = await page.evaluate(() => {
    const svg = document.querySelector('svg.iso-plane-cube') as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const faces = [...svg.querySelectorAll<SVGPolygonElement>('.iso-plane-face')];
    // Screen-space edges of every plane: a point within 3px of one is on an
    // outline stroke (which belongs to that plane) — boundary, not checked.
    const edges = faces.flatMap((f) => {
      const m = f.getScreenCTM()!;
      const pts = [...f.points].map((p) => new DOMPoint(p.x, p.y).matrixTransform(m));
      return pts.map((a, k) => [a, pts[(k + 1) % pts.length]] as const);
    });
    const nearEdge = (x: number, y: number) => edges.some(([a, b]) => {
      const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(a.x + t * dx - x, a.y + t * dy - y) < 3;
    });
    const contains = (face: SVGPolygonElement, x: number, y: number) => {
      const m = face.getScreenCTM()!.inverse();
      const p = new DOMPoint(x, y).matrixTransform(m);
      return face.isPointInFill(p);
    };
    const hitsPerPlane: Record<string, number> = {};
    const mismatches: string[] = [];
    const N = 40;
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
      const x = r.left + (r.width * i) / N, y = r.top + (r.height * j) / N;
      const el = document.elementFromPoint(x, y);
      if (el?.closest('.iso-axis') || nearEdge(x, y)) continue; // axis lines/labels on top; outline strokes
      const plane = (el?.closest('[data-plane]') as SVGGElement | null)?.dataset.plane;
      const under = faces.filter((f) => contains(f, x, y)).map((f) => (f.closest('[data-plane]') as SVGGElement).dataset.plane);
      if (plane) {
        hitsPerPlane[plane] = (hitsPerPlane[plane] ?? 0) + 1;
        if (!under.includes(plane)) mismatches.push(`${plane} hit outside its shape at ${x},${y}`);
      } else if (under.length) mismatches.push(`missed ${under.join('/')} at ${x},${y}`);
    }
    return { hitsPerPlane, mismatches };
  });
  expect(result.mismatches).toEqual([]);
  for (const plane of ['Top', 'Front', 'Right']) expect(result.hitsPerPlane[plane] ?? 0).toBeGreaterThan(20);
});

test('X / Y / Z labels sit at the tips of their scaled axes', async ({ page }) => {
  await openPicker(page);
  const gaps = await page.evaluate(() => [...document.querySelectorAll('svg.iso-plane-cube .iso-axis')].map((g) => {
    const line = g.querySelector('line') as SVGLineElement, text = g.querySelector('text') as SVGTextElement;
    const tip = new DOMPoint(line.x2.baseVal.value, line.y2.baseVal.value).matrixTransform(line.getScreenCTM()!);
    const b = text.getBoundingClientRect();
    const dx = Math.max(b.left - tip.x, 0, tip.x - b.right), dy = Math.max(b.top - tip.y, 0, tip.y - b.bottom);
    return { label: text.textContent, gap: Math.hypot(dx, dy) / (line.ownerSVGElement!.getBoundingClientRect().width), size: b.height };
  }));
  expect(gaps.map((g) => g.label)).toEqual(['X', 'Y', 'Z']);
  // Within 3% of the graphic's width of the tip (the offset scales with it), and the text itself scaled up.
  for (const g of gaps) { expect(g.gap).toBeLessThan(0.03); expect(g.size).toBeGreaterThan(9); }
});

test('hovering a plane highlights it; clicking the graphic picks that plane', async ({ page }) => {
  await openPicker(page);
  // A point that only the Right plane covers.
  const spot = await page.evaluate(() => {
    const svg = document.querySelector('svg.iso-plane-cube') as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    for (let i = 1; i < 60; i++) for (let j = 1; j < 60; j++) {
      const x = r.left + (r.width * i) / 60, y = r.top + (r.height * j) / 60;
      if ((document.elementFromPoint(x, y)?.closest('[data-plane]') as SVGGElement | null)?.dataset.plane === 'Right') return { x, y };
    }
    return null;
  });
  expect(spot).not.toBeNull();
  const face = page.locator('[data-plane="Right"] .iso-plane-face');
  const before = Number(await face.evaluate((el) => getComputedStyle(el).opacity));
  await page.mouse.move(spot!.x, spot!.y);
  await expect.poll(async () => Number(await face.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(before);
  await expect(page.locator('[data-plane="Right"] title')).toHaveText(/Right Plane/);   // tooltip
  await page.mouse.click(spot!.x, spot!.y);
  await expect(cube(page)).toHaveCount(0);
  await expect(activePlane(page)).toHaveText('Right');
});

test('keyboard: Tab to the planes, arrows move between them, Enter picks', async ({ page }) => {
  await openPicker(page);
  await page.locator('[data-plane="Top"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-plane="Front"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-plane="Right"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-plane="Top"]')).toBeFocused();         // wraps
  await page.keyboard.press('Enter');
  await expect(cube(page)).toHaveCount(0);
  await expect(activePlane(page)).toHaveText('Top');
});

test('the plane cards still pick planes', async ({ page }) => {
  await openPicker(page);
  await page.getByRole('button', { name: /^Right Plane/ }).click();
  await expect(activePlane(page)).toHaveText('Right');
});
