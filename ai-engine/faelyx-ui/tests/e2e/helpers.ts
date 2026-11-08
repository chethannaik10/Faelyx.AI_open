import type { Page } from '@playwright/test';

// Sketch-space helpers: every coordinate below is in the canvas's own
// sketch units (the origin marker sits at 200,150; +y is down on screen).
export async function openSketch(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Front Plane/ }).click();
}
export const svg = (page: Page) => page.locator('svg.sketch-svg');
export async function toScreen(page: Page, x: number, y: number) {
  return page.evaluate(([sx, sy]) => {
    const s = document.querySelector('svg.sketch-svg') as SVGSVGElement;
    const g = s.querySelector(':scope > g') as SVGGElement;
    const p = s.createSVGPoint(); p.x = sx; p.y = sy;
    const q = p.matrixTransform(g.getScreenCTM()!);
    return { x: q.x, y: q.y };
  }, [x, y] as const);
}
export async function click(page: Page, x: number, y: number) {
  const p = await toScreen(page, x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(60);
}
export async function dblclick(page: Page, x: number, y: number) {
  const p = await toScreen(page, x, y); await page.mouse.dblclick(p.x, p.y); await page.waitForTimeout(80);
}
export async function drag(page: Page, a: [number, number], b: [number, number]) {
  const p = await toScreen(page, ...a), q = await toScreen(page, ...b);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(p.x + ((q.x - p.x) * i) / 8, p.y + ((q.y - p.y) * i) / 8);
  await page.mouse.up(); await page.waitForTimeout(80);
}
export async function tool(page: Page, name: string) {
  await page.locator('.tool-item').filter({ has: page.locator(`span:text-is("${name}")`) }).first().click();
}
export async function variant(page: Page, group: string, name: string) {
  await page.locator(`button[aria-label="${group} variants"]`).click();
  await page.locator('.tool-flyout-item').filter({ has: page.locator(`span:text-is("${name}")`) }).click();
}
export const input = (page: Page, label: string) => page.locator(`.live-dim-label:text-is("${label}") + input`);
export async function esc(page: Page, n = 4) { for (let i = 0; i < n; i++) await page.keyboard.press('Escape'); }
export const lineCoords = (page: Page) => page.$$eval('svg.sketch-svg line.sketch-line', (ls) =>
  ls.map((l) => ['x1', 'y1', 'x2', 'y2'].map((k) => Number(l.getAttribute(k)))));
