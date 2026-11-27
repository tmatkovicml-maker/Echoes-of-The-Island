// QR orders: guests order from the menu on their phone, the hut's screen shows the orders,
// the guest is told when the order is ready and pays at the counter (cash or card) on the hut's
// own till. These are orders only, not receipts: nothing here is a fiscal record.

export const STATUSES = ['nova', 'priprema', 'spremno', 'preuzeto', 'otkazano'];
export const ACTIVE = ['nova', 'priprema', 'spremno'];
export const PAY = ['gotovina', 'kartica'];
export const MAX_LINES = 20, MAX_QTY = 10;

const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim();
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const yes = v => /^(da|yes|true|1|x|✓)$/i.test(String(v ?? '').trim());

// The day an order belongs to: Zagreb date, changing at 06:00 so the night after midnight counts with the evening before
export function businessDay(ms = Date.now()) {
  return new Date(ms - 6 * 3600 * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/Zagreb' });
}

// One menu item as stored; null if it is not valid
export function validItem(v, sort = 0) {
  if (!v || typeof v !== 'object') return null;
  const id = clean(v.id, 12).toUpperCase();
  const name = clean(v.name, 60);
  const price = Math.round(Number(String(v.price ?? '').replace(',', '.')) * 100) / 100;
  if (!/^[A-Z0-9]{1,12}$/.test(id) || !name || !Number.isFinite(price) || price < 0 || price > 500) return null;
  return {
    id, name, price, sort: Number.isInteger(v.sort) ? v.sort : sort,
    cat: clean(v.cat, 30) || 'Ostalo', descr: clean(v.descr, 160), allergens: clean(v.allergens, 120),
    available: v.available ? 1 : 0, alcohol: v.alcohol ? 1 : 0, pnp: v.pnp ? 1 : 0,
  };
}

// Jelovnik.csv (also what the organizer exports from the workbook's "Jelovnik" sheet):
// ID; Kategorija; Naziv; Opis; Cijena (EUR); Alergeni; Dostupno (DA/NE); Alkohol (DA/NE). Other columns are ignored.
export function parseMenuCsv(textIn) {
  const lines = String(textIn).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV nema stavki.');
  const sep = [';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const split = l => { const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) { const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ''; } else cur += c; }
    out.push(cur); return out.map(s => s.trim()); };
  const head = split(lines[0]).map(fold);
  const col = (...n) => head.findIndex(h => n.some(x => h === x || h.startsWith(x)));
  const c = { id: col('id', 'sifra'), cat: col('kategorija'), name: col('naziv'), descr: col('opis'), price: col('cijena'),
    allergens: col('alergeni'), available: col('dostupno'), alcohol: col('alkohol'), pnp: col('pnp', 'porez na potrosnju') };
  if (c.name < 0 || c.price < 0) throw new Error('Nedostaju stupci "Naziv" i "Cijena".');
  const items = [], errors = [];
  lines.slice(1).forEach((l, n) => {
    const r = split(l), get = k => (c[k] >= 0 ? r[c[k]] : '');
    const it = validItem({ id: get('id') || `X${n + 1}`, cat: get('cat'), name: get('name'), descr: get('descr'), price: get('price'),
      allergens: get('allergens'), available: c.available < 0 || yes(get('available')), alcohol: yes(get('alcohol')), pnp: yes(get('pnp')) }, n);
    if (it) items.push(it); else errors.push(`Redak ${n + 2}: provjerite ID, naziv i cijenu`);
  });
  if (new Set(items.map(i => i.id)).size !== items.length) errors.push('ID stavke se ponavlja');
  if (errors.length) throw new Error(errors.slice(0, 8).join('\n'));
  if (!items.length) throw new Error('CSV nema stavki.');
  return items;
}

// The guest's order: [{id, qty}] against the menu. Prices always come from the menu, never from the phone.
export function priceOrder(lines, menu) {
  if (!Array.isArray(lines) || !lines.length || lines.length > MAX_LINES) return { error: 'empty' };
  const byId = new Map(menu.map(m => [m.id, m]));
  const merged = new Map();
  for (const l of lines) {
    const id = clean(l && l.id, 12).toUpperCase(), qty = Number(l && l.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { error: 'qty' };
    merged.set(id, Math.min(MAX_QTY, (merged.get(id) || 0) + qty));
  }
  const items = [];
  for (const [id, qty] of merged) {
    const m = byId.get(id);
    if (!m || !m.available) return { error: 'unavailable', item: id, name: m ? m.name : '' };
    items.push({ id, name: m.name, qty, price: m.price, alcohol: !!m.alcohol });
  }
  const total = Math.round(items.reduce((s, i) => s + i.qty * i.price, 0) * 100) / 100;
  return { items, total, alcohol: items.some(i => i.alcohol) };
}

export function ordersCsv(rows) {
  const q = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const eur = n => n.toFixed(2).replace('.', ',');
  const out = [['Dan', 'Broj', 'Vrijeme', 'Stavke', 'Ukupno (EUR)', 'Plaćanje', 'Status']];
  for (const r of rows) {
    const items = JSON.parse(r.items).map(i => `${i.qty}× ${i.name}`).join(', ');
    out.push([r.day, r.num, new Date(r.created).toLocaleTimeString('hr-HR', { timeZone: 'Europe/Zagreb', hour: '2-digit', minute: '2-digit' }),
      items, eur(r.total), r.pay, r.status]);
  }
  return '﻿' + out.map(r => r.map(q).join(';')).join('\r\n') + '\r\n';
}

// ---- A1 FreshPay: the menu in the layout of FreshPay's article import template (LoaderHR.xlsx) ----
// VAT: 13 % for food (serving meals), 25 % for drinks; consumption tax (PNP) 3 % in Mali Lošinj on the items marked PNP.
export const PNP_RATE = 0.03;
export const FRESHPAY_HEAD = ['Šifra proizvoda', 'Naziv proizvoda', 'Nabavna cijena', 'Prodajna cijena s PDV', 'POREZ', 'PNP ', 'Oslobođen od poreza',
  'Razlog oslobođenja od poreza', 'Barkod', 'Grupa proizvoda', 'Proizvod za prodaju', 'Jedinica mjere', 'Proizvod je usluga', 'Skladište',
  'Stanje skladišta', 'Minimalna zaliha', 'Precizna količina/mjera', 'Broj decimala količine proizvoda/usluge', 'Naknada za proizvod',
  'Unos prodajne cijene na blagajni'];
export const vatFor = m => (/^(hrana|slatko|jelo|jela|slastice?)$/i.test(m.cat.trim()) ? '13%' : '25%');
export function freshPayRows(menu) {
  return menu.map(m => [m.id, m.name, null, m.price, vatFor(m), m.pnp ? PNP_RATE : null, null, null, null, m.cat, 'Y', 'Komad', null,
    'Vlastito skladište', null, null, 'N', null, null, 'N']);
}
