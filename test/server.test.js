// Runs the Worker locally (wrangler dev, empty database) and checks it over HTTP, including many sign-ups
// arriving at the same moment for the last places. Run: npm run test:server
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8790 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const PW = 'test-lozinka';
let proc, dir, ipN = 0;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'advent-'));
  proc = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', dir,
    '--var', `ADMIN_PASSWORD:${PW}`, '--show-interactive-dev-session=false'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  let log = '';
  proc.stdout.on('data', d => log += d); proc.stderr.on('data', d => log += d);
  for (let i = 0; i < 360; i++) {
    try { if ((await fetch(BASE + '/api/stanje')).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('wrangler dev did not start:\n' + log);
}, { timeout: 200000 });
after(() => { try { process.kill(-proc.pid, 'SIGTERM'); } catch {} rmSync(dir, { recursive: true, force: true }); });

// every request comes from its own IP unless given one, so the per-IP limit does not get in the way
const call = (path, { body, method, admin, ip } = {}) => fetch(BASE + path, {
  method: method || (body ? 'POST' : 'GET'),
  headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || `10.0.${Math.floor(++ipN / 250)}.${ipN % 250}`,
    ...(admin ? { 'X-Admin-Password': PW } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));
const signUp = (slots, phone, name = 'Test Učenik', extra = {}) =>
  call('/api/prijava', { body: { name, phone, slots, kind: 'student', adult: true, consent: true, website: '', ...extra } });
const phone = n => `091 ${String(1000000 + n).slice(1, 4)} ${String(1000000 + n).slice(4)}`;
const setCap = (id, capacity) => call(`/api/admin/slots/${id}`, { body: { capacity }, admin: true });
const free = async id => (await call('/api/stanje')).data.slots.find(s => s.id === id).free;

test('public state: 48 shifts, nothing personal', async () => {
  const { data } = await call('/api/stanje');
  assert.equal(data.slots.length, 48);
  const first = data.slots.find(s => s.id === '2026-12-10-B');                 // from Termini_prijave.csv
  assert.deepEqual([first.capacity, first.free, first.note], [3, 3, 'Koncert']);
  assert.match(first.event, /Ciplići/);
  assert.equal(data.open, true);
  assert.ok(data.slots.every(s => !('taken' in s) || s.taken === undefined));
});

test('30 people at once for the last place: exactly one gets it', async () => {
  await setCap('2026-12-20-A', 1);
  const res = await Promise.all(Array.from({ length: 30 }, (_, i) => signUp(['2026-12-20-A'], phone(100 + i))));
  assert.equal(res.filter(r => r.status === 200).length, 1);
  assert.ok(res.filter(r => r.status !== 200).every(r => r.data.error === 'full'));
  assert.equal(await free('2026-12-20-A'), 0);
});

test('40 people at once for 3 places: exactly three get them', async () => {
  await setCap('2026-12-21-B', 3);
  const res = await Promise.all(Array.from({ length: 40 }, (_, i) => signUp(['2026-12-21-B'], phone(200 + i))));
  assert.equal(res.filter(r => r.status === 200).length, 3);
  assert.equal(await free('2026-12-21-B'), 0);
});

test('one person sending many sign-ups at once stays at 30 h a week', async () => {
  const days = ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18'];
  for (const d of days) await setCap(`${d}-B`, 5);
  const res = await Promise.all(days.map(d => signUp([`${d}-B`], phone(300))));   // 5 × 8 h in week 51
  assert.equal(res.filter(r => r.status === 200).length, 3);                     // 24 h; a 4th would be 32 h
  assert.ok(res.filter(r => r.status !== 200).every(r => r.data.error === 'week_hours'));
  const { data } = await call('/api/admin/data', { admin: true });
  const p = data.people.find(x => x.phone_fmt === phone(300));
  assert.ok(p && p.weeks['2026-W51'] <= 30, JSON.stringify(p));
});

test('one block a day, also when A and B are sent at the same moment', async () => {
  const res = await Promise.all([signUp(['2026-12-22-A'], phone(400)), signUp(['2026-12-22-B'], '+385 91 000 400')]);   // same number, other spelling
  assert.equal(res.filter(r => r.status === 200).length, 1);
  assert.equal(res.find(r => r.status !== 200).data.error, 'one_per_day');
  const both = await signUp(['2026-12-23-A', '2026-12-23-B'], phone(401));
  assert.equal(both.data.error, 'one_per_day');
});

test('a sign-up with a rule broken is rejected as a whole', async () => {
  // week 52: 23.12. B (8) + 24.12. B (11) + 25.12. B (8) + 27.12. B (11) = 38 h
  const r = await signUp(['2026-12-23-B', '2026-12-24-B', '2026-12-25-B', '2026-12-27-B'], phone(500));
  assert.equal(r.data.error, 'week_hours');
  assert.equal((await call('/api/admin/data', { admin: true })).data.regs.filter(x => x.phone_fmt === phone(500)).length, 0);
});

test('12 h rest, pupils only in the holidays, student or pupil required', async () => {
  assert.equal((await signUp(['2026-12-16-B', '2026-12-17-A'], phone(4000))).data.error, 'rest');
  await signUp(['2026-12-18-B'], phone(4001));
  assert.equal((await signUp(['2026-12-19-A'], phone(4001))).data.error, 'rest');
  assert.equal((await signUp(['2026-12-23-A'], phone(4002), 'Ena Enić', { kind: 'ucenik' })).data.error, 'pupil_dates');
  assert.equal((await signUp(['2026-12-28-B'], phone(4002), 'Ena Enić', { kind: 'ucenik' })).status, 200);
  assert.equal((await signUp(['2026-12-29-B'], phone(4003), 'Ena Enić', { kind: undefined })).data.error, 'kind');
  const mine = await signUp(['2026-12-30-B'], phone(4004), 'Ivo Ivić', { kind: 'ucenik' });
  assert.equal(mine.data.kind, 'ucenik');
});

test('payroll: regular and +50 % hours per person and calendar year', async () => {
  // 31.12. B 16–03: 6 h regular + 2 h night in 2026, 3 h on 1.1.2027 (holiday, night)
  await setCap('2026-12-31-B', 9);
  await signUp(['2026-12-31-B', '2026-12-13-A'], phone(5000), 'Pero Perić');   // 13.12. is a Sunday: 7 h +50 %
  const p = (await call('/api/admin/data', { admin: true })).data.people.find(x => x.phone_fmt === phone(5000));
  assert.deepEqual(p.pay, { 2026: { reg: 6, plus: 9 }, 2027: { reg: 0, plus: 3 } });
  assert.equal(p.net, Math.round((6 * 11.15 + 12 * 16.73) * 100) / 100);
  const csv = await fetch(BASE + '/api/admin/obracun.csv', { headers: { 'X-Admin-Password': PW } }).then(r => r.text());
  assert.ok(csv.includes('Pero Perić;' + phone(5000) + ';Student (SCRI);2026;6;9;15;'));
  assert.ok(csv.includes('Pero Perić;' + phone(5000) + ';Student (SCRI);2027;0;3;3;'));
});

test('form checks: adult, consent, honeypot, name, phone', async () => {
  assert.equal((await signUp(['2026-12-26-A'], phone(600), 'Ana Anić', { adult: false })).data.error, 'adult');
  assert.equal((await signUp(['2026-12-26-A'], phone(600), 'Ana Anić', { consent: false })).data.error, 'consent');
  assert.equal((await signUp(['2026-12-26-A'], phone(600), 'Ana Anić', { website: 'http://spam' })).data.error, 'invalid');
  assert.equal((await signUp(['2026-12-26-A'], phone(600), 'Ana')).data.error, 'name');
  assert.equal((await signUp(['2026-12-26-A'], '051 123 456', 'Ana Anić')).data.error, 'phone');
});

test('sign-up, private link, cancel; nothing personal in the public state', async () => {
  const r = await signUp(['2026-12-28-A', '2026-12-29-B'], '0981234567', 'Marko Marić');
  assert.equal(r.status, 200);
  assert.equal(r.data.regs.length, 2);
  const mine = await call(`/api/moji/${r.data.token}`);
  assert.equal(mine.data.name, 'Marko Marić');
  const pub = JSON.stringify((await call('/api/stanje')).data);
  assert.ok(!pub.includes('Marko') && !pub.includes('981234567'));
  const c = await call(`/api/moji/${r.data.token}/otkazi`, { body: { id: r.data.regs[0].id } });
  assert.equal(c.data.regs.length, 1);
  assert.equal((await call(`/api/moji/${r.data.token}/otkazi`, { body: { id: 999999 } })).status, 404);
});

test('closed sign-up is refused; organizer opens it again', async () => {
  await call('/api/admin/settings', { body: { open: false }, admin: true });
  assert.equal((await signUp(['2026-12-30-A'], phone(700))).data.error, 'closed');
  await call('/api/admin/settings', { body: { open: true }, admin: true });
  assert.equal((await signUp(['2026-12-30-A'], phone(700))).status, 200);
});

test('manual confirmation: pending holds the place until the organizer confirms', async () => {
  await call('/api/admin/settings', { body: { manual: true }, admin: true });
  await setCap('2026-12-31-A', 1);
  const r = await signUp(['2026-12-31-A'], phone(800));
  assert.equal(r.data.regs[0].status, 'pending');
  assert.equal((await signUp(['2026-12-31-A'], phone(801))).data.error, 'full');
  const id = r.data.regs[0].id;
  const after = await call(`/api/admin/regs/${id}/confirm`, { body: {}, admin: true });
  assert.equal(after.data.regs.find(x => x.id === id).status, 'confirmed');
  await call('/api/admin/settings', { body: { manual: false }, admin: true });
});

test('organizer: wrong password, add by hand (force), export, CSV import, wipe', async () => {
  assert.equal((await fetch(BASE + '/api/admin/data', { headers: { 'X-Admin-Password': 'krivo', 'CF-Connecting-IP': '10.9.9.9' } })).status, 401);
  const full = await call('/api/admin/regs', { body: { slot: '2026-12-20-A', name: 'Ivo Ivić', phone: phone(900) }, admin: true });
  assert.equal(full.data.error, 'full');
  const forced = await call('/api/admin/regs', { body: { slot: '2026-12-20-A', name: 'Ivo Ivić', phone: phone(900), force: true }, admin: true });
  assert.equal(forced.status, 200);
  const bytes = new Uint8Array(await fetch(BASE + '/api/admin/export.csv', { headers: { 'X-Admin-Password': PW } }).then(r => r.arrayBuffer()));
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);   // BOM, so Excel reads the letters right
  const csv = new TextDecoder().decode(bytes);
  assert.ok(csv.startsWith('Datum;Dan;Tjedan;Blok'));
  assert.ok(csv.includes('Ivo Ivić') && csv.includes(phone(900)));
  // importing shifts that would drop a shift with sign-ups is refused
  const bad = await call('/api/admin/import', { body: { csv: 'Datum;Blok;Mjesta\n10.12.2026.;A;2\n' }, admin: true });
  assert.equal(bad.data.error, 'slots_in_use');
  const wiped = await call('/api/admin/wipe', { body: { confirm: 'OBRIŠI' }, admin: true });
  assert.equal(wiped.data.regs.length, 0);
  const csvText = 'Datum;Blok;Od;Do;Sati;Mjesta\n' + (await call('/api/stanje')).data.slots
    .map(s => `${s.day};${s.block};${s.start};${s.end};${s.hours};${s.id === '2026-12-24-B' ? 4 : 2}`).join('\n');
  const ok = await call('/api/admin/import', { body: { csv: csvText }, admin: true });
  assert.equal(ok.data.slots.find(s => s.id === '2026-12-24-B').capacity, 4);
});

test('QR code: PNG and SVG of the public page', async () => {
  const png = new Uint8Array(await fetch(BASE + '/qr.png').then(r => r.arrayBuffer()));
  assert.deepEqual([...png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const svg = await fetch(BASE + '/qr.svg').then(r => r.text());
  assert.ok(svg.includes('<svg') && svg.includes('<path'));
});

test('export for the workbook: name, ISO date, block', async () => {
  await signUp(['2026-12-12-A'], phone(3000), 'Tina Tinić');
  const text = new TextDecoder().decode(await fetch(BASE + '/api/admin/export-tablica.csv', { headers: { 'X-Admin-Password': PW } }).then(r => r.arrayBuffer()));
  const lines = text.trim().split('\r\n');
  assert.equal(lines[0], 'Ime i prezime;Datum;Blok');
  assert.ok(lines.includes('Tina Tinić;2026-12-12;A'));
});

// ---- QR orders ----
const order = (items, extra = {}) => call('/api/narudzba', { body: { items, pay: 'kartica', name: 'Mia', note: '', ...extra } });
const staff = (path, body, pin = PW) => fetch(BASE + '/api/osoblje/' + path, { method: body ? 'POST' : 'GET',
  headers: { 'Content-Type': 'application/json', 'X-Staff-Pin': pin, 'CF-Connecting-IP': '10.77.0.1' }, body: body ? JSON.stringify(body) : undefined })
  .then(async r => ({ status: r.status, data: await r.json() }));

test('QR orders: closed until opened, then priced by the server and numbered per day', async () => {
  assert.equal((await order([{ id: 'H01', qty: 1 }])).data.error, 'closed');
  await call('/api/admin/settings', { body: { orders_open: true }, admin: true });
  const menu = (await call('/api/meni')).data;
  assert.equal(menu.open, true);
  assert.equal(menu.items.length, 12);                                    // the two undecided items are hidden
  const a = await order([{ id: 'H01', qty: 2, price: 0 }, { id: 'P05', qty: 1 }]);
  assert.equal(a.status, 200);
  assert.deepEqual([a.data.total, a.data.status, a.data.pay], [24.5, 'nova', 'kartica']);
  const b = await order([{ id: 'P04', qty: 1 }], { pay: 'gotovina' });
  assert.equal(b.data.num, a.data.num + 1);
  assert.equal(b.data.ahead, 1);
  assert.equal((await order([{ id: 'P08', qty: 1 }])).data.error, 'adult');
  assert.equal((await order([{ id: 'P08', qty: 1 }], { adult: true })).data.alcohol, true);
  assert.equal((await order([{ id: 'S01', qty: 1 }])).data.error, 'unavailable');
  assert.equal((await order([{ id: 'H01', qty: 1 }], { pay: 'bitcoin' })).data.error, 'pay');

  // the hut's screen
  assert.equal((await staff('narudzbe', null, 'krivo')).status, 401);
  const list = (await staff('narudzbe')).data;
  const mine = list.orders.find(o => o.num === a.data.num);
  assert.equal(mine.name, 'Mia');
  await staff('narudzbe/' + mine.id, { status: 'priprema' });
  assert.equal((await call(`/api/narudzba/${a.data.token}`)).data.status, 'priprema');
  assert.equal((await call(`/api/narudzba/${a.data.token}/otkazi`, { body: {} })).data.error, 'started');
  assert.equal((await call(`/api/narudzba/${b.data.token}/otkazi`, { body: {} })).data.status, 'otkazano');
  await staff('narudzbe/' + mine.id, { status: 'spremno' });
  await staff('narudzbe/' + mine.id, { status: 'preuzeto' });

  // sold out on the screen → gone from the guests' menu
  await staff('meni/H02', { available: false });
  assert.ok(!(await call('/api/meni')).data.items.some(i => i.id === 'H02'));
  assert.equal((await order([{ id: 'H02', qty: 1 }])).data.error, 'unavailable');

  // organizer: per-day total counts picked-up orders only; export
  const sum = (await call('/api/admin/meni', { admin: true })).data;
  assert.equal(sum.days[0].total, 24.5);
  assert.equal(sum.days[0].cancelled, 1);
  const csv = await fetch(BASE + '/api/admin/narudzbe.csv', { headers: { 'X-Admin-Password': PW } }).then(r => r.text());
  assert.ok(csv.includes('2× Kozice u češnjaku, 1× Čaj') && csv.includes('24,50'));
  // the organizer edits the menu
  const items = sum.menu.map(m => m.id === 'S01' ? { ...m, name: 'Fritule', available: true } : m);
  const saved = (await call('/api/admin/meni', { body: { items }, admin: true })).data;
  assert.equal(saved.menu.find(m => m.id === 'S01').name, 'Fritule');
  assert.ok((await call('/api/meni')).data.items.some(i => i.name === 'Fritule'));
});

test('QR code of the menu', async () => {
  const svg = await fetch(BASE + '/qr-meni.svg').then(r => r.text());
  assert.ok(svg.includes('<path'));
  const png = new Uint8Array(await fetch(BASE + '/qr-meni.png').then(r => r.arrayBuffer()));
  assert.deepEqual([...png.slice(0, 4)], [137, 80, 78, 71]);
});

test('extra shifts outside the blocks: every day in a range except the skipped days', async () => {
  const r = await call('/api/admin/extras', { admin: true, body: { name: 'Vlasnik', times: '08:00-09:00 Nabava; 09:00-12:00 Otvaranje; 16:00-19:00',
    from: '10.12.2026.', to: '2.1.2027.', skip: '14.12., 15.12., 16.12., 25.12.' } });
  assert.equal(r.status, 200);
  const days = new Set(r.data.extras.filter(x => x.name === 'Vlasnik').map(x => x.day));
  assert.equal(days.size, 20);                                    // 24 days − 4 skipped
  assert.ok(!days.has('2026-12-25') && !days.has('2026-12-14') && days.has('2026-12-17'));
  assert.deepEqual(r.data.extras.filter(x => x.day === '2026-12-10').map(x => [x.start, x.end, x.label]),
    [['08:00', '09:00', 'Nabava'], ['09:00', '12:00', 'Otvaranje'], ['16:00', '19:00', '']]);
  // they take no place in the blocks
  const a17 = (await call('/api/admin/data', { admin: true })).data.slots.find(s => s.id === '2026-12-17-A');
  assert.equal(a17.taken, 0);
  assert.equal((await call('/api/admin/extras', { admin: true, body: { name: 'X', times: '19:00-16:00', from: '10.12.2026.', to: '11.12.2026.' } })).status, 400);
  const ids = r.data.extras.filter(x => x.day === '2026-12-10').map(x => x.id);
  const after = await call('/api/admin/extras/delete', { admin: true, body: { ids } });
  assert.equal(after.data.extras.filter(x => x.day === '2026-12-10').length, 0);
  // Telegram without a token: connecting says so, orders still work
  assert.equal((await call('/api/admin/telegram', { admin: true, body: {} })).data.error, 'no_token');
});

test('per-IP limit on sign-ups', async () => {
  const one = [];
  for (let i = 0; i < 17; i++) one.push(await call('/api/prijava', { ip: '10.200.0.1', body: { name: 'Spam Spam', phone: phone(2000 + i), slots: ['2027-01-02-A'], kind: 'student', adult: true, consent: true } }));
  assert.ok(one.slice(15).every(r => r.data.error === 'too_many'));
});
