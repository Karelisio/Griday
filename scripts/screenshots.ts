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
await page.getByRole('button', { name: 'Voir la grille' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/05b-victory-board.png` });

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

// 7. Statistiques, archives, réglages (page secondaire).
await page.locator('nav').getByText('Stats', { exact: true }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/08a-stats-dark.png` });
await page.locator('nav').getByText('Archives', { exact: true }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/08b-archive-dark.png` });
await page.getByRole('button', { name: 'Réglages' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/08c-settings-dark.png` });
await page.getByRole('button', { name: 'Retour' }).click();
await page.waitForTimeout(400);

// 8. Anglais, clair.
await open(page, { language: 'en' });
await page.screenshot({ path: `${out}/09-today-light-en.png` });

// 9. Petit écran (360 × 740) : la feuille d'indice laisse voir les cases concernées.
const small = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const smallPage = await small.newPage();
smallPage.on('pageerror', (e) => console.error('ERREUR PAGE :', e.message));
await open(smallPage, {});
await smallPage.getByRole('button', { name: 'Indice' }).click();
await smallPage.waitForTimeout(1000);
await smallPage.screenshot({ path: `${out}/10-hint-small.png` });

// 10. Progression simulée au 20 octobre (série de 14 jours, un jour gelé puis rattrapé en archive) :
// série sur « Aujourd'hui », calendrier des archives, statistiques.
{
  const PLAN = [
    [6, 1],
    [7, 1],
    [7, 2],
    [8, 2],
    [8, 3],
    [9, 3],
    [10, 4],
  ] as const; // lundi → dimanche
  const results: Record<string, unknown[]> = {};
  for (let d = 5; d <= 19; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    const [size, tier] = PLAN[(d - 5) % 7]!;
    const timeMs = (40 + size * 12 + tier * 35 + ((d * 37) % 50)) * 1000;
    results[date] = d === 8 ? [timeMs + 30_000, 1, size, tier, 1, '2026-10-10'] : [timeMs, d % 4 === 0 ? 1 : 0, size, tier, 0, date];
  }
  const unlimited = [
    [6, 1, 52_000, 0, '2026-10-12'],
    [8, 2, 184_000, 1, '2026-10-14'],
    [8, 3, 251_000, 0, '2026-10-15'],
    [10, 4, 612_000, 2, '2026-10-18'],
  ];
  const seeded = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await seeded.clock.setFixedTime(new Date('2026-10-20T10:00:00'));
  // Données posées avant tout script de la page : l'app ne peut pas les écraser au démarrage.
  await seeded.addInitScript(
    ({ s, history, streak, unl }) => {
      localStorage.clear();
      localStorage.setItem('CapacitorStorage.settings.v1', s);
      localStorage.setItem('CapacitorStorage.daily.history.v1', JSON.stringify({ v: 1, results: history }));
      localStorage.setItem('CapacitorStorage.streak.v1', JSON.stringify(streak));
      localStorage.setItem('CapacitorStorage.unlimited.history.v1', JSON.stringify({ v: 1, results: unl }));
    },
    {
      s: settings({}),
      history: results,
      streak: { freezes: 1, frozen: ['2026-10-08'], rewarded: ['2026-10-12'], settledThrough: '2026-10-19' },
      unl: unlimited,
    },
  );
  const p = await seeded.newPage();
  p.on('pageerror', (e) => console.error('ERREUR PAGE :', e.message));
  await p.goto(url);
  await p.waitForSelector('[data-cell="0"]', { timeout: 20_000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/11a-today-streak.png` });
  await p.locator('nav').getByText('Archives', { exact: true }).click();
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/11b-archive.png` });
  await p.locator('nav').getByText('Stats', { exact: true }).click();
  await p.waitForTimeout(700);
  await p.setViewportSize({ width: 412, height: 2000 }); // écran entier (le contenu défile dans l'app, pas la page)
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/11c-stats.png` });
  await seeded.close();
}

await browser.close();
console.log(`Captures dans ${out}/`);
