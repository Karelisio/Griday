/**
 * Captures d'écran de contrôle visuel (Playwright + Chromium) sur le serveur de dev.
 * Usage : npx vite --port 5173 & npx tsx scripts/screenshots.ts [dossier] [url]
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';
import { localISODate } from '../engine/core/date';
import { getDailyPuzzle } from '../engine/index';

const out = process.argv[2] ?? 'screenshots';
const url = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });

const settings = (s: Record<string, unknown>) =>
  JSON.stringify({ language: 'fr', theme: 'light', dynamicColor: true, haptics: true, autoCross: false, ...s });

async function open(page: Page, s: Record<string, unknown>) {
  await page.goto(url);
  await page.evaluate((v) => {
    localStorage.clear();
    localStorage.setItem('CapacitorStorage.settings.v1', v);
  }, settings(s));
  await page.reload();
  await page.waitForSelector('[data-cell="0"]', { timeout: 20_000 });
  await page.waitForTimeout(400);
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await context.newPage();
page.on('pageerror', (e) => console.error('ERREUR PAGE :', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console :', m.text()));

const daily = getDailyPuzzle(localISODate(new Date()));
const { size: n, solution } = daily.puzzle;
const queenCells = solution.map((c, r) => r * n + c);

// 1. Puzzle du jour, clair, FR.
await open(page, {});
await page.screenshot({ path: `${out}/01-today-light-fr.png` });

// 2. Partie en cours : 2 reines justes, une reine en conflit, quelques croix.
await page.click(`[data-cell="${queenCells[0]}"]`);
await page.waitForTimeout(400);
await page.click(`[data-cell="${queenCells[2]}"]`);
await page.waitForTimeout(400);
const wrong = queenCells[0]! + (solution[0]! > 0 ? -1 : 1);
await page.click(`[data-cell="${wrong}"]`);
await page.waitForTimeout(400);
for (const cell of [n * (n - 1), n * (n - 1) + 1]) {
  await page.click(`[data-cell="${cell}"]`);
  await page.waitForTimeout(80);
  await page.click(`[data-cell="${cell}"]`);
  await page.waitForTimeout(350);
}
await page.screenshot({ path: `${out}/02-playing-conflict.png` });

// 3. Indice (signale l'erreur), puis indice normal après correction.
await page.getByRole('button', { name: 'Indice' }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/03-hint-mistake.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.click(`[data-cell="${wrong}"]`);
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Indice' }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/04-hint-step.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// 4. Victoire.
for (const cell of queenCells) {
  const label = (await page.getAttribute(`[data-cell="${cell}"]`, 'aria-label')) ?? '';
  if (!/reine/.test(label)) {
    await page.click(`[data-cell="${cell}"]`);
    await page.waitForTimeout(150);
  }
}
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/05-victory.png` });

// 5. Sombre.
await open(page, { theme: 'dark' });
await page.screenshot({ path: `${out}/06-today-dark.png` });

// 6. Illimité.
await page.locator('nav').getByText('Illimité', { exact: true }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/07a-unlimited-empty-dark.png` });
await page.getByRole('button', { name: 'Nouvelle grille' }).first().click();
await page.waitForSelector('section:not([hidden]) [data-cell="0"]', { timeout: 20_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/07b-unlimited-dark.png` });
await page.getByRole('button', { name: 'Nouvelle grille' }).first().click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/07c-unlimited-sheet-dark.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// 7. Réglages.
await page.locator('nav').getByText('Réglages', { exact: true }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/08-settings-dark.png` });

// 8. Anglais, clair.
await open(page, { language: 'en' });
await page.screenshot({ path: `${out}/09-today-light-en.png` });

await browser.close();
console.log(`Captures dans ${out}/`);
