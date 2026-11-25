// Promo flyers for the hut (Advent, Christmas, New Year) and logo variants.
// Usage: node scripts/promo.js [https://adresa-stranice/]   (needs Playwright, like scripts/tisak.js)
// Writes tisak/promo/*.pdf|png and tisak/logo/*.svg|png|pdf. Programme dates are the town's Advent programme
// on Trg Republike Hrvatske (from the organizer's planning workbook); the QR codes open the menu for ordering.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { qrSvg } from '../src/qr.js';

const BASE = (process.argv[2] || 'https://echoes-of-the-island.t-matkovicml.workers.dev/').replace(/\/?$/, '/');
const MENU = new URL('meni', BASE).href;
const root = fileURLToPath(new URL('..', import.meta.url));
const outP = root + 'tisak/promo/', outL = root + 'tisak/logo/';
mkdirSync(outP, { recursive: true }); mkdirSync(outL, { recursive: true });
const asset = p => pathToFileURL(root + p).href;
const LOGO = readFileSync(root + 'public/logo.svg', 'utf8').replace(/<\?xml[^>]*>\s*/, '');
const logo = (fill, cls = 'logo') => LOGO.replace('fill="#FF2A96"', `fill="${fill}" class="${cls}"`);
const qr = u => qrSvg(u).replace(/<\?xml[^>]*>\s*/, '').replace(/ width="[^"]*" height="[^"]*"/, ' class="qr"');

const NAVY = '#0C0F1D', PINK = '#FF2A96', CREAM = '#F3EEF0', LAMP = '#FFE3A8', PINE = '#0F2B26', MUTED = '#A9ABC0';
const fonts = [['Barlow', 'barlow', 400], ['Barlow', 'barlow', 600], ['Barlow Condensed', 'barlow-condensed', 600], ['Barlow Condensed', 'barlow-condensed', 800]]
  .flatMap(([f, file, w]) => ['latin', 'latin-ext'].map(s =>
    `@font-face { font-family: '${f}'; font-weight: ${w}; src: url(${asset(`public/fonts/${file}-${s}-${w}-normal.woff2`)}) format('woff2'); }`)).join('\n');
const base = `${fonts}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Barlow, sans-serif; color: ${CREAM}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.cond { font-family: 'Barlow Condensed', sans-serif; font-weight: 800; text-transform: uppercase; }
em { font-style: normal; color: ${PINK}; }
.lights { display: flex; justify-content: center; gap: 5mm; }
.lights i { width: 2.2mm; height: 2.2mm; border-radius: 50%; background: ${LAMP}; box-shadow: 0 0 2mm ${LAMP}; }
.lights i:nth-child(even) { background: ${PINK}; box-shadow: 0 0 2mm ${PINK}; }
.qr { display: block; width: 100%; height: auto; }
.glow { filter: drop-shadow(0 0 1.6mm rgba(255, 42, 150, .75)); }
`;
const lights = n => `<div class="lights">${'<i></i>'.repeat(n)}</div>`;

// a snowflake: three crossed arms with small v-tips
const flake = (x, y, s, color = CREAM, op = 0.55) => `<g transform="translate(${x} ${y}) scale(${s})" stroke="${color}" stroke-width="1.1" stroke-linecap="round" fill="none" opacity="${op}">${[0, 60, 120]
  .map(a => `<g transform="rotate(${a})"><line x1="0" y1="-9" x2="0" y2="9"/><path d="M-2.6 -6.6L0 -4.2L2.6 -6.6M-2.6 6.6L0 4.2L2.6 6.6"/></g>`).join('')}</g>`;
// a pine tree as stacked triangles (like the hut's design) with a few lamps
const tree = (x, y, w, h, lamps = true) => {
  const tiers = [0, 0.3, 0.58].map((t, i) => {
    const ty = y + h * t, tw = w * (0.62 + i * 0.19), th = h * 0.46;
    return `<polygon points="${x},${ty} ${x + tw / 2},${ty + th} ${x - tw / 2},${ty + th}" fill="${PINE}"/>`;
  }).join('');
  const dots = lamps ? [[0.36, -0.12, LAMP], [0.52, 0.14, PINK], [0.7, -0.2, LAMP], [0.84, 0.22, PINK], [0.66, 0.06, PINK]]
    .map(([t, dx, c]) => `<circle cx="${x + dx * w}" cy="${y + h * t}" r="${w * 0.018}" fill="${c}" style="filter: drop-shadow(0 0 ${w * 0.02}px ${c})"/>`).join('') : '';
  return tiers + `<rect x="${x - w * 0.04}" y="${y + h * 1.04}" width="${w * 0.08}" height="${h * 0.1}" fill="#2B1E18"/>` + dots;
};
const star = (x, y, r, c = LAMP) => `<path d="M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z" fill="${c}" style="filter: drop-shadow(0 0 1.5px ${c})"/>`;

// ---------- flyer template, A5 ----------
function flyer({ bleed, kicker, title, sub, deco, hero, cols, extra, cta, foot }) {
  const b = bleed ? 3 : 0;
  return `<!doctype html><html lang="hr"><head><meta charset="utf-8"><style>${base}
@page { size: ${148 + 2 * b}mm ${210 + 2 * b}mm; margin: 0; }
.page { width: ${148 + 2 * b}mm; height: ${210 + 2 * b}mm; padding: ${b}mm; background: ${NAVY}; position: relative; overflow: hidden; }
.in { width: 148mm; height: 210mm; position: relative; padding: 9mm 10mm 8mm; display: flex; flex-direction: column; align-items: center; text-align: center; }
.deco { position: absolute; inset: 0; width: 148mm; height: 210mm; }
.halo { position: absolute; left: 50%; top: 30mm; width: 160mm; height: 110mm; transform: translateX(-50%); border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 42, 150, .2), transparent); }
.top { position: relative; display: flex; align-items: center; gap: 3mm; }
.top .logo { width: 17mm; height: 17mm; }
.top .k { font-size: 9.5pt; letter-spacing: .28em; color: ${PINK}; text-align: left; line-height: 1.25; }
.top .k b { display: block; color: ${CREAM}; letter-spacing: .2em; font-size: 8pt; }
.hero { position: relative; margin-top: 4mm; }
h1 { position: relative; font-size: 33pt; line-height: .94; letter-spacing: .015em; margin-top: 4mm; }
.sub { position: relative; color: ${MUTED}; font-size: 10pt; margin-top: 3mm; }
.cols { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; width: 100%; margin-top: 5mm; text-align: left; }
.box { background: rgba(23, 27, 46, .92); border: .3mm solid #2A2F4A; border-radius: 3mm; padding: 3mm 3.4mm; }
.box h2 { font: 800 12pt/1 'Barlow Condensed', sans-serif; text-transform: uppercase; letter-spacing: .06em; color: ${LAMP}; margin-bottom: 2mm; }
.box ul { list-style: none; }
.box li { font-size: 8.8pt; line-height: 1.28; padding: .8mm 0; border-bottom: .2mm solid #232842; }
.box li:last-child { border-bottom: 0; }
.box li b { font: 800 9.5pt/1 'Barlow Condensed', sans-serif; color: ${PINK}; letter-spacing: .03em; margin-right: 1.2mm; }
.hours { position: relative; width: 100%; margin-top: 3mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; }
.hours div { border: .3mm solid ${PINK}; border-radius: 3mm; padding: 2.4mm 2mm; text-align: center; box-shadow: 0 0 2.5mm rgba(255, 42, 150, .35) inset; }
.hours b { display: block; font: 800 11pt/1 'Barlow Condensed', sans-serif; text-transform: uppercase; letter-spacing: .05em; color: ${LAMP}; }
.hours span { display: block; font: 800 15pt/1.1 'Barlow Condensed', sans-serif; margin-top: 1mm; }
.cta { position: relative; display: flex; align-items: center; gap: 5mm; width: 100%; margin-top: auto; text-align: left; }
.cta .qrbox { width: 30mm; flex: none; background: #fff; border-radius: 3mm; padding: 1.6mm; box-shadow: 0 0 0 .8mm ${PINK}, 0 0 4mm rgba(255, 42, 150, .7); }
.cta .t { font-size: 15pt; line-height: 1.02; }
.cta p { font-size: 8.6pt; color: ${MUTED}; margin-top: 1.6mm; line-height: 1.3; }
.foot { position: relative; margin-top: 4mm; font-size: 7.6pt; color: ${MUTED}; letter-spacing: .02em; }
</style></head><body><div class="page"><div class="in">
  <div class="halo"></div>
  <svg class="deco" viewBox="0 0 148 210" preserveAspectRatio="none">${deco}</svg>
  <div class="top">${logo(PINK, 'logo glow')}<div class="cond k">${kicker}</div></div>
  <div class="hero">${hero}</div>
  <h1 class="cond">${title}</h1>
  <div class="sub">${sub}</div>
  <div class="cols">${cols}</div>${extra || ''}
  <div class="cta"><div class="qrbox">${qr(MENU)}</div><div><div class="cond t">${cta}</div>
    <p>Skeniraj, odaberi jelo i piće, a kad je spremno, plati na šanku: gotovinom ili karticom.</p></div></div>
  <div class="foot">${foot}</div>
</div></div></body></html>`;
}
const list = (h, items) => `<div class="box"><h2>${h}</h2><ul>${items.map(([d, t]) => `<li>${d ? `<b>${d}</b>` : ''}${t}</li>`).join('')}</ul></div>`;
const MENU_LIST = [['', 'Kozice u češnjaku'], ['', 'Hot dog s tempura kozicama'], ['', 'Burger od tune'], ['', 'Lignje frigane'], ['', 'Kuhano vino i kuhani gin'], ['', 'Topla čokolada i čaj']];
const FOOT = 'Echoes of the Island · Trg Republike Hrvatske, Mali Lošinj · Alkohol samo 18+';

// neon roof over the logo, like the hut's façade
const roof = (w = 92) => `<div style="position:relative;width:${w}mm;height:40mm;margin:0 auto">
  <svg viewBox="0 0 ${w} 40" style="width:${w}mm;height:40mm;display:block"><polygon points="${w / 2},2 ${w - 2},38 2,38" fill="#1C2140" stroke="${PINK}" stroke-width="1.1" style="filter: drop-shadow(0 0 1.5px ${PINK})"/></svg>
  <div style="position:absolute;left:${w / 2 - 13}mm;top:10mm;width:26mm;height:26mm">${logo(PINK, 'glow').replace('<svg ', '<svg style="width:100%;height:100%;display:block" ')}</div></div>`;

const flyers = {
  advent: {
    kicker: 'Advent na Lošinju<b>10. 12. 2026. – 2. 1. 2027.</b>',
    hero: roof() + `<div style="margin-top:-1mm">${lights(11)}</div>`,
    title: 'Zimska <em>kućica</em><br>na Trgu',
    sub: 'Echoes of the Island · Winter Edition · svaki dan od 9 h',
    deco: tree(14, 150, 22, 40) + tree(134, 140, 26, 48) + flake(20, 22, 0.55) + flake(128, 30, 0.7) + flake(118, 78, 0.4) + flake(12, 62, 0.45) + star(74, 7, 2.2),
    cols: list('Na meniju', MENU_LIST) + list('Koncerti na Trgu', [['10. 12.', 'Ciplići · otvaranje'], ['12. 12.', 'Mišomanija'], ['26. 12.', 'Dellboys'], ['27. 12.', 'Silente & DJ Charly'], ['30. 12.', 'Macaklini bend'], ['31. 12.', 'SuperCover Band · doček']]),
    cta: 'Naruči<br><em>mobitelom</em>',
  },
  bozic: {
    kicker: 'Božić na Lošinju<b>24. – 27. 12. 2026.</b>',
    hero: `<svg viewBox="0 0 100 62" style="width:100mm;height:62mm;display:block">${tree(50, 4, 54, 52)}${star(50, 4, 4.2)}${flake(12, 14, 0.5)}${flake(88, 10, 0.6)}${flake(16, 46, 0.35)}${flake(86, 44, 0.4)}</svg>`,
    title: 'Badnjak<br>do <em>3 ujutro</em>',
    sub: 'Kuhano vino, kozice i glazba na Trgu Republike Hrvatske',
    deco: flake(14, 120, 0.5) + flake(136, 110, 0.6) + flake(138, 150, 0.35),
    cols: list('Badnjak i Božić', [['24. 12.', 'Badnje jutro na Trgu, 11 h'], ['24. 12.', 'polnoćka, a kućica radi do 3 h'], ['25. 12.', 'Božić · kućica od 9 h'], ['26. 12.', 'Koncert Dellboys, 21 h']]) +
      list('Studentska večer', [['27. 12.', 'Silente & DJ Charly, 21 h'], ['', 'kućica radi do 3 h'], ['', 'kuhano vino i kuhani gin'], ['', 'topla čokolada i čaj']]),
    cta: 'Pogledaj<br><em>jelovnik</em>',
  },
  novagodina: {
    kicker: 'Doček na Trgu RH<b>29. 12. 2026. – 2. 1. 2027.</b>',
    hero: `<div class="cond" style="font-size:78pt;line-height:.9;color:transparent;-webkit-text-stroke:.9mm ${PINK};filter:drop-shadow(0 0 2.5mm rgba(255,42,150,.8));letter-spacing:.02em;margin-top:2mm">2027</div>` + `<div style="margin-top:3mm">${lights(11)}</div>`,
    title: 'Doček uz<br><em>SuperCover Band</em>',
    sub: '31. 12. od 22 h · kućica radi do 3 ujutro',
    deco: star(20, 40, 2.6) + star(130, 34, 3.2, PINK) + star(118, 70, 1.8) + star(30, 78, 1.6, PINK) + star(74, 118, 1.4) + flake(16, 190, 0.4) + flake(134, 186, 0.5),
    cols: list('Zadnji tjedan', [['29. 12.', 'Christmas Disco Fever & DJ-evi, 20 h'], ['30. 12.', 'Koncert Macaklini bend, 21 h'], ['31. 12.', 'Doček · SuperCover Band, 22 h'], ['2. 1.', 'After New Year program']]) +
      list('Za ponoć i poslije', [['', 'kuhano vino i kuhani gin'], ['', 'pivo i gazirani sokovi'], ['', 'kozice, lignje, tempura hot dog'], ['', 'burger od tune']]),
    extra: `<div class="hours"><div><b>29. i 30. 12.</b><span>9 – 24 h</span></div><div><b>31. 12.</b><span>9 – <em>3 h</em></span></div><div><b>1. i 2. 1.</b><span>9 – 24 h</span></div></div>`,
    cta: 'Naruči<br><em>mobitelom</em>',
  },
};

// ---------- logo variants ----------
const LOCKUP = `<!doctype html><html><head><meta charset="utf-8"><style>${base}
body { background: transparent; } #x { display: inline-flex; align-items: center; gap: 22px; padding: 40px 56px; }
#x .logo { width: 220px; height: 220px; } #x .n { font-size: 84px; line-height: .9; letter-spacing: .02em; }
#x .w { font-size: 34px; letter-spacing: .34em; color: ${PINK}; margin-top: 14px; } #x .d { font: 600 22px/1 Barlow, sans-serif; color: ${LAMP}; letter-spacing: .18em; margin-top: 14px; }
</style></head><body><div id="x">${logo(PINK, 'logo glow')}<div><div class="cond n">Echoes<br>of the Island</div><div class="cond w">Winter Edition</div><div class="d">ADVENT NA LOŠINJU 2026.</div></div></div></body></html>`;
const ringText = 'ADVENT NA LOŠINJU · WINTER EDITION · 2026./2027. · ';
const BADGE = `<!doctype html><html><head><meta charset="utf-8"><style>${base} body { background: transparent; } #x { width: 1000px; height: 1000px; }</style></head><body>
<svg id="x" viewBox="0 0 1000 1000"><defs><path id="ring" d="M500 500m-370 0a370 370 0 1 1 740 0a370 370 0 1 1 -740 0"/></defs>
<circle cx="500" cy="500" r="480" fill="${NAVY}"/><circle cx="500" cy="500" r="462" fill="none" stroke="${PINK}" stroke-width="7" style="filter: drop-shadow(0 0 10px ${PINK})"/>
<circle cx="500" cy="500" r="316" fill="none" stroke="#2A2F4A" stroke-width="3"/>
<text font-family="Barlow Condensed" font-weight="800" font-size="56" fill="${CREAM}"><textPath href="#ring" startOffset="0" textLength="${Math.floor(2 * Math.PI * 370) - 4}" lengthAdjust="spacing">${ringText}</textPath></text>
<svg x="250" y="236" width="500" height="500" viewBox="0 0 1024 1024">${LOGO.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</svg>
${flake(262, 500, 2.4, LAMP, 0.9)}${flake(738, 500, 2.4, LAMP, 0.9)}
</svg></body></html>`.replace('<svg x="250" y="236" width="500" height="500" viewBox="0 0 1024 1024">', `<svg x="250" y="236" width="500" height="500" viewBox="0 0 1024 1024" fill="${PINK}" style="filter: drop-shadow(0 0 8px rgba(255,42,150,.8))">`);

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch();
async function pdfPage(file, html, w, h) {
  writeFileSync(file + '.html', html);
  const p = await browser.newPage({ viewport: { width: Math.round(w * 3.78), height: Math.round(h * 3.78) }, deviceScaleFactor: 2 });
  await p.goto(pathToFileURL(file + '.html').href); await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: file + '.pdf', width: w + 'mm', height: h + 'mm', printBackground: true, preferCSSPageSize: true });
  await p.screenshot({ path: file + '.png', fullPage: true }); await p.close();
}
async function pngOf(file, html, scale = 2, bg) {
  writeFileSync(file + '.html', html);
  const p = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: scale });
  await p.goto(pathToFileURL(file + '.html').href); await p.evaluate(() => document.fonts.ready);
  if (bg) await p.addStyleTag({ content: `#x { background: ${bg}; }` });
  await p.locator('#x').screenshot({ path: file + '.png', omitBackground: !bg }); await p.close();
}
for (const [name, f] of Object.entries(flyers)) {
  await pdfPage(outP + `${name}-A5`, flyer({ ...f, bleed: false, foot: FOOT }), 148, 210);
  await pdfPage(outP + `${name}-A5-za-tiskaru`, flyer({ ...f, bleed: true, foot: FOOT }), 154, 216);
}
await pngOf(outL + 'logo-winter-edition', LOCKUP);
await pngOf(outL + 'logo-winter-edition-tamna-podloga', LOCKUP, 2, NAVY);
await pngOf(outL + 'logo-badge-advent', BADGE, 1);
writeFileSync(outL + 'logo-roza.svg', LOGO);
writeFileSync(outL + 'logo-krem.svg', LOGO.replace('fill="#FF2A96"', `fill="${CREAM}"`));
writeFileSync(outL + 'logo-crni.svg', LOGO.replace('fill="#FF2A96"', 'fill="#000000"'));
await browser.close();
console.log('Gotovo: tisak/promo/ i tisak/logo/');
