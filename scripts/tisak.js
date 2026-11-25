// Print files for the hut: a flyer for the shift sign-up and table stickers for QR orders.
// Usage: node scripts/tisak.js [https://adresa-stranice/]   (needs Playwright: npm i -g playwright && npx playwright install chromium)
// Writes tisak/*.pdf (for print) and tisak/*.png (previews). The QR codes point to the address given (or the workers.dev one).
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { qrSvg } from '../src/qr.js';

const BASE = (process.argv[2] || 'https://echoes-of-the-island.t-matkovicml.workers.dev/').replace(/\/?$/, '/');
const SIGNUP = BASE, MENU = new URL('meni', BASE).href;
const short = u => u.replace(/^https:\/\//, '').replace(/\/$/, '');
const root = fileURLToPath(new URL('..', import.meta.url));
const out = root + 'tisak/';
mkdirSync(out, { recursive: true });
const asset = p => pathToFileURL(root + p).href;
const qr = u => qrSvg(u).replace(/<\?xml[^>]*>\s*/, '').replace(/ width="[^"]*" height="[^"]*"/, ' class="qr"');

const fonts = [['Barlow', 'barlow', 400], ['Barlow', 'barlow', 600], ['Barlow Condensed', 'barlow-condensed', 600], ['Barlow Condensed', 'barlow-condensed', 800]]
  .flatMap(([f, file, w]) => ['latin', 'latin-ext'].map(s =>
    `@font-face { font-family: '${f}'; font-weight: ${w}; src: url(${asset(`public/fonts/${file}-${s}-${w}-normal.woff2`)}) format('woff2'); }`)).join('\n');

const css = `${fonts}
* { box-sizing: border-box; margin: 0; padding: 0; }
:root { --navy: #0C0F1D; --navy2: #171B2E; --pink: #FF2A96; --cream: #F3EEF0; --muted: #A9ABC0; --lamp: #FFE3A8; --amber: #E9A44C; }
html, body { background: #fff; }
body { font-family: Barlow, sans-serif; color: var(--cream); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.cond { font-family: 'Barlow Condensed', sans-serif; font-weight: 800; text-transform: uppercase; }
.lights { display: flex; justify-content: center; gap: 5mm; }
.lights i { width: 2.2mm; height: 2.2mm; border-radius: 50%; background: var(--lamp); box-shadow: 0 0 2mm var(--lamp); }
.lights i:nth-child(even) { background: var(--pink); box-shadow: 0 0 2mm var(--pink); }
.qrbox { background: #fff; border-radius: 4mm; padding: 2mm; box-shadow: 0 0 0 1mm var(--pink), 0 0 5mm rgba(255, 42, 150, .7); }
.qr { display: block; width: 100%; height: auto; }
`;
const lights = n => `<div class="lights">${'<i></i>'.repeat(n)}</div>`;

// ---------- flyer, A5 (148 × 210 mm) ----------
function flyer(bleed) {
  const b = bleed ? 3 : 0;
  return `<!doctype html><html lang="hr"><head><meta charset="utf-8"><style>${css}
@page { size: ${148 + 2 * b}mm ${210 + 2 * b}mm; margin: 0; }
.page { width: ${148 + 2 * b}mm; height: ${210 + 2 * b}mm; padding: ${b}mm; background: var(--navy); position: relative; overflow: hidden; }
.in { width: 148mm; height: 210mm; padding: 9mm 11mm 8mm; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; }
.glow { position: absolute; left: 50%; top: 115mm; width: 170mm; height: 120mm; transform: translateX(-50%); border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 42, 150, .22), transparent); }
.logo { width: 30mm; height: 30mm; }
.kick { color: var(--pink); font-size: 11pt; letter-spacing: .32em; margin-top: 1mm; }
h1 { font-size: 31pt; line-height: .98; letter-spacing: .02em; margin: 3mm 0 2mm; }
h1 em { font-style: normal; color: var(--pink); }
.when { color: var(--muted); font-size: 10.5pt; }
.facts { display: grid; grid-template-columns: 1fr 1fr; gap: 2.4mm; width: 100%; margin: 5mm 0 4mm; text-align: left; position: relative; }
.fact { background: var(--navy2); border: .3mm solid #2A2F4A; border-radius: 3mm; padding: 2.6mm 3mm; }
.fact b { display: block; font: 800 12.5pt/1.05 'Barlow Condensed', sans-serif; text-transform: uppercase; letter-spacing: .03em; color: var(--lamp); }
.fact span { font-size: 8.6pt; line-height: 1.3; color: var(--cream); }
.qrrow { display: flex; align-items: center; gap: 6mm; width: 100%; position: relative; margin-top: auto; }
.qrrow .qrbox { width: 46mm; flex: none; }
.qrrow .txt { text-align: left; }
.qrrow .txt .cond { font-size: 20pt; line-height: 1; color: var(--cream); }
.qrrow .txt .cond em { font-style: normal; color: var(--pink); }
.qrrow .txt p { font-size: 9pt; color: var(--muted); margin-top: 2mm; line-height: 1.35; }
.qrrow .txt .url { font-size: 7.6pt; color: var(--lamp); margin-top: 2mm; word-break: break-all; }
.foot { margin-top: 5mm; font-size: 7.6pt; color: var(--muted); }
</style></head><body><div class="page"><div class="in">
  <div class="glow"></div>
  <img class="logo" src="${asset('public/logo.svg')}" alt="">
  <div class="cond kick">Advent na Lošinju</div>
  <h1 class="cond">Tražimo ekipu<br>za <em>kućicu</em></h1>
  <div class="when">Echoes of the Island · Trg Republike Hrvatske · 10. 12. 2026. – 2. 1. 2027.</div>
  <div style="margin-top:4mm">${lights(11)}</div>
  <div class="facts">
    <div class="fact"><b>11,15 € neto / sat</b><span>16,73 € noću, nedjeljom i blagdanom.</span></div>
    <div class="fact"><b>Sam biraš smjene</b><span>Blok A 09–16 h ili blok B 16–24 h. Bez računa, s mobitela.</span></div>
    <div class="fact"><b>Najviše 30 h tjedno</b><span>Jedan blok dnevno. Koncertne večeri i doček Nove godine.</span></div>
    <div class="fact"><b>Studenti i učenici 18+</b><span>Studenti od 10. 12. (Student servis), učenici od 24. 12. (Dom mladih).</span></div>
  </div>
  <div class="qrrow">
    <div class="qrbox">${qr(SIGNUP)}</div>
    <div class="txt">
      <div class="cond">Skeniraj<br>i <em>odaberi</em><br>termine</div>
      <p>Tko se prvi prijavi, njegov je termin. Termin se zatvara čim je popunjen.</p>
      <div class="url">${short(SIGNUP)}</div>
    </div>
  </div>
  <div class="foot">Podaci (ime, mobitel, termini) služe samo za raspored rada i brišu se nakon sezone.</div>
</div></div></body></html>`;
}

// ---------- table sticker, 90 × 90 mm ----------
const STICKER = 90;
function sticker() {
  return `<div class="st">
  <div class="sthead"><img src="${asset('public/logo.svg')}" alt=""><div><div class="cond k">Echoes of the Island</div><div class="cond h">Naruči<br><em>mobitelom</em></div></div></div>
  <div class="stbody">
    <div class="qrbox">${qr(MENU)}</div>
    <ol>
      <li><b>1</b><span>Skeniraj</span></li>
      <li><b>2</b><span>Odaberi jelo i piće</span></li>
      <li><b>3</b><span>Kad je <em>spremno</em>, plati na šanku</span></li>
    </ol>
  </div>
  <div class="stfoot">Gotovina ili kartica · Alkohol samo 18+</div>
</div>`;
}
const stickerCss = `
.st { width: ${STICKER}mm; height: ${STICKER}mm; background: var(--navy); border-radius: 7mm; padding: 5mm 5.5mm 4mm; display: flex; flex-direction: column;
  border: .8mm solid var(--pink); box-shadow: inset 0 0 4mm rgba(255, 42, 150, .45); overflow: hidden; }
.sthead { display: flex; align-items: center; gap: 3mm; }
.sthead img { width: 15mm; height: 15mm; }
.sthead .k { color: var(--pink); font-size: 7pt; letter-spacing: .2em; }
.sthead .h { font-size: 17pt; line-height: .95; color: var(--cream); }
.sthead .h em { font-style: normal; color: var(--pink); }
.stbody { display: flex; align-items: center; gap: 3.5mm; margin-top: 4mm; }
.stbody .qrbox { width: 46mm; flex: none; }
.stbody ol { list-style: none; display: flex; flex-direction: column; gap: 2.4mm; }
.stbody li { font-size: 9pt; line-height: 1.15; color: var(--cream); display: flex; gap: 1.6mm; align-items: baseline; }
.stbody li em { font-style: normal; color: var(--lamp); font-weight: 600; }
.stbody li b { font: 800 13pt/1 'Barlow Condensed', sans-serif; color: var(--pink); }
.stfoot { margin-top: auto; text-align: center; font: 600 8pt/1 'Barlow Condensed', sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
`;
// one sticker with 2 mm bleed for a print shop
function stickerSingle() {
  return `<!doctype html><html lang="hr"><head><meta charset="utf-8"><style>${css}${stickerCss}
@page { size: ${STICKER + 4}mm ${STICKER + 4}mm; margin: 0; }
.pad { width: ${STICKER + 4}mm; height: ${STICKER + 4}mm; padding: 2mm; background: #fff; }
</style></head><body><div class="pad">${sticker()}</div></body></html>`;
}
// A4 sheet with 6 stickers and light cutting guides (for an office printer and sticker paper, or to cut and laminate)
function stickerSheet() {
  return `<!doctype html><html lang="hr"><head><meta charset="utf-8"><style>${css}${stickerCss}
@page { size: 210mm 297mm; margin: 0; }
.sheet { width: 210mm; height: 297mm; padding: 12mm 12mm; display: grid; grid-template-columns: repeat(2, ${STICKER}mm); grid-auto-rows: ${STICKER}mm;
  gap: 2mm 6mm; justify-content: center; align-content: center; background: #fff; }
.cut { outline: .2mm dashed #c8c8c8; outline-offset: 1mm; border-radius: 7mm; }
</style></head><body><div class="sheet">${Array.from({ length: 6 }, () => `<div class="cut">${sticker()}</div>`).join('')}</div></body></html>`;
}

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch();
async function render(name, html, w, h) {
  writeFileSync(out + name + '.html', html);
  const p = await browser.newPage({ viewport: { width: Math.round(w * 3.78), height: Math.round(h * 3.78) }, deviceScaleFactor: 2 });
  await p.goto(pathToFileURL(out + name + '.html').href);
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: out + name + '.pdf', width: w + 'mm', height: h + 'mm', printBackground: true, preferCSSPageSize: true });
  await p.screenshot({ path: out + name + '.png', fullPage: true });
  await p.close();
}
await render('letak-A5', flyer(false), 148, 210);
await render('letak-A5-za-tiskaru', flyer(true), 154, 216);
await render('naljepnica-90mm', stickerSingle(), STICKER + 4, STICKER + 4);
await render('naljepnice-A4-6kom', stickerSheet(), 210, 297);
await browser.close();
console.log(`Gotovo: tisak/ (prijave → ${SIGNUP}, jelovnik → ${MENU})`);
