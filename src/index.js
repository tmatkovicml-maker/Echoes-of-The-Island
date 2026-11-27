// Echoes of the Island, the Advent hut in Mali Lošinj (10.12.2026–02.01.2027):
// 1. shift sign-up: adult students pick their shifts without an account; a shift closes as soon as it is full;
// 2. QR orders: guests order from the menu on their phone, the hut's screen shows the orders, the guest pays at
//    the counter (cash or card) on the hut's own till. Orders are not receipts.
//
// Public (no account):
//   GET  /api/stanje                     shifts with free places, whether sign-up is open, terms (no names, no phones)
//   POST /api/prijava                    {name, phone, slots: [id], adult, consent, website}  → {token, regs}
//   GET  /api/moji/:token                the shifts booked with this private link
//   POST /api/moji/:token/otkazi         {id}  cancel one shift (until the cancellation deadline)
//   GET  /qr.svg, /qr.png                QR code of the public page for print (PUBLIC_URL or this address)
// Organizer (X-Admin-Password = ADMIN_PASSWORD):
//   GET  /api/admin/data                 shifts, all sign-ups with names and phones, settings
//   GET  /api/admin/export.csv           all sign-ups for Excel
//   POST /api/admin/settings             {open, cancel_hours, manual, terms, organizer, wipe_on}
//   POST /api/admin/slots/:id            {capacity}
//   POST /api/admin/import               {csv}  replace the shifts with the organizer's CSV
//   POST /api/admin/regs                 {slot, name, phone, force}  add a sign-up by hand
//   POST /api/admin/regs/:id/confirm     confirm a sign-up (when sign-ups are confirmed by hand)
//   DELETE /api/admin/regs/:id           remove a sign-up
//   POST /api/admin/wipe                 {confirm: "OBRIŠI"}  delete all names and phones now
//   GET  /api/admin/obracun.csv          hours per person and year, regular / +50 %, for the services' payroll
//   GET  /api/admin/export-tablica.csv  Ime i prezime;Datum;Blok for pasting into the "Prijave" sheet of the planning workbook
//   GET  /api/admin/meni                 menu and orders per day · POST {items} save the menu · POST meni/import {csv}
//   GET  /api/admin/narudzbe.csv         all orders for Excel
//   GET  /api/admin/freshpay.xlsx        the menu as A1 FreshPay's article import file (VAT 13/25 %, PNP 3 %)
//   POST /api/admin/extras               {name, times, from, to, skip}  shifts outside the blocks (organizer's own hours)
//   POST /api/admin/extras/delete        {ids}
//   POST|DELETE /api/admin/telegram      connect / disconnect Telegram messages for new orders (TELEGRAM_BOT_TOKEN)
// QR orders (guests): GET /api/meni · POST /api/narudzba {items: [{id, qty}], pay, name, note, website}
//   GET /api/narudzba/:token (status) · POST /api/narudzba/:token/otkazi (only while not started)
// Hut's screen (X-Staff-Pin = STAFF_PIN or ADMIN_PASSWORD): GET /api/osoblje/narudzbe · POST /api/osoblje/narudzbe/:id {status}
//   POST /api/osoblje/otvoreno {open} · POST /api/osoblje/meni/:id {available}
// Pages: /  sign-up · /moji/:token  my shifts · /admin  organizer · /meni  menu and ordering · /narudzba/:token  my order
//   · /kuhinja  the hut's order screen · /qr-meni.svg|png  QR code of the menu
//
// Everything is in one Durable Object (SQLite). A Durable Object runs one request at a time and
// signUp() does its checks and writes in one synchronous transaction, so two people can never
// take the same last place, and nobody can go over 30 hours a week or take two blocks on one day.
import { DurableObject } from 'cloudflare:workers';
import PUBLIC_PAGE from './public.html';
import ADMIN_PAGE from './admin.html';
import { qrSvg, qrPng } from './qr.js';
import TERMINI_CSV from '../Termini_prijave.csv';   // the organizer's 48 shifts, loaded into an empty database
import JELOVNIK_CSV from '../Jelovnik.csv';          // the menu for QR orders, loaded into an empty database
import MENU_PAGE from './menu.html';
import KITCHEN_PAGE from './kitchen.html';
import { STATUSES, PAY, businessDay, validItem, parseMenuCsv, priceOrder, ordersCsv, FRESHPAY_HEAD, freshPayRows } from './orders.js';
import { xlsx } from './xlsx.js';
import {
  MAX_WEEK_HOURS, KINDS, PAY_BASE, PAY_PLUS, normalizePhone, formatPhone, isoWeek, isDay, checkChoice, weekHours, payHours,
  parseSlotsCsv, parseDate, addDays, slotStartMs,
} from './rules.js';

const MINUTE = 60 * 1000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const TERMS_DEFAULT = 'Studenti rade preko Student servisa Rijeka (SCRI), punoljetni učenici preko Učeničkog servisa Dom mladih Rijeka.\n'
  + 'Satnicu dogovaramo sa svakim osobno.';
// the earlier default text showed the pay publicly; a database that still holds it gets the new text
const TERMS_WITH_PAY = 'Satnica: 11,15 € neto po satu.\nNoću (22–06 h), nedjeljom i blagdanom (25. 12., 26. 12., 1. 1.): 16,73 € neto po satu (+50 %).\n'
  + 'Studenti rade preko Student servisa Rijeka (SCRI), punoljetni učenici preko Učeničkog servisa Dom mladih Rijeka.';
const DEFAULTS = {
  open: true,             // sign-up open
  cancel_hours: 48,       // a student can cancel until this many hours before the shift starts
  manual: false,          // false: a sign-up counts at once; true: the organizer confirms each one (it holds the place meanwhile)
  // conditions shown on the sign-up page; no pay: each person's pay is set in /admin and seen only by the organizer
  terms: TERMS_DEFAULT,
  organizer: '',          // who collects the data (privacy notice)
  wipe_on: '2027-01-31',  // names and phones are deleted automatically on this day
  orders_open: false,     // QR orders are taken (switched on the hut's screen or in /admin)
};
const LIMITS = { signup: [15, 10 * MINUTE], cancel: [30, 10 * MINUTE], mine: [120, 10 * MINUTE], admin_fail: [10, 15 * MINUTE],
  order: [8, 10 * MINUTE], order_view: [400, 10 * MINUTE] };

const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
const validName = v => { const s = str(v, 80); return /^[\p{L}][\p{L}'’.\- ]*\s[\p{L}][\p{L}'’.\- ]*$/u.test(s) ? s : null; };

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class Store extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS limits (k TEXT NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS slots (id TEXT PRIMARY KEY, day TEXT NOT NULL, block TEXT NOT NULL,
      start TEXT NOT NULL, "end" TEXT NOT NULL, hours REAL NOT NULL, capacity INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', event TEXT NOT NULL DEFAULT '')`);
    // one row per person per shift; token = the private link of the sign-up it was made with
    this.sql.exec(`CREATE TABLE IF NOT EXISTS regs (id INTEGER PRIMARY KEY AUTOINCREMENT, slot_id TEXT NOT NULL,
      phone TEXT NOT NULL, name TEXT NOT NULL, token TEXT NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL, created INTEGER NOT NULL,
      UNIQUE (slot_id, phone))`);
    // kind: student | ucenik | drugo (see rules.js); a database from before has none, so it is added
    if (!this.sql.exec('PRAGMA table_info(regs)').toArray().some(c => c.name === 'kind')) this.sql.exec(`ALTER TABLE regs ADD COLUMN kind TEXT NOT NULL DEFAULT 'student'`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS regs_phone ON regs (phone)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS regs_token ON regs (token)');
    const cols = this.sql.exec('PRAGMA table_info(slots)').toArray().map(c => c.name);
    if (!cols.includes('note')) this.sql.exec(`ALTER TABLE slots ADD COLUMN note TEXT NOT NULL DEFAULT ''`);
    if (cols.length && !cols.includes('event')) {
      // a database from before events were shown: add the column and fill in each day's programme from the CSV
      this.sql.exec(`ALTER TABLE slots ADD COLUMN event TEXT NOT NULL DEFAULT ''`);
      for (const t of parseSlotsCsv(TERMINI_CSV)) this.sql.exec('UPDATE slots SET event = ? WHERE id = ?', t.event, t.id);
    }
    // QR orders: the menu, and the orders (name is only a first name to call out, optional)
    this.sql.exec(`CREATE TABLE IF NOT EXISTS menu (id TEXT PRIMARY KEY, sort INTEGER NOT NULL, cat TEXT NOT NULL, name TEXT NOT NULL,
      descr TEXT NOT NULL, price REAL NOT NULL, allergens TEXT NOT NULL, available INTEGER NOT NULL, alcohol INTEGER NOT NULL, pnp INTEGER NOT NULL DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, num INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE, items TEXT NOT NULL, total REAL NOT NULL, alcohol INTEGER NOT NULL, pay TEXT NOT NULL,
      name TEXT NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS orders_day ON orders (day, num)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS orders_status ON orders (status)');
    // shifts outside the A/B blocks, set by the organizer (his own hours: buying in, opening, afternoons)
    this.sql.exec(`CREATE TABLE IF NOT EXISTS extras (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, name TEXT NOT NULL,
      start TEXT NOT NULL, "end" TEXT NOT NULL, label TEXT NOT NULL DEFAULT '')`);
    // pay per person (net €/h, regular and +50 %), set by the organizer; anyone without one gets PAY_BASE / PAY_PLUS
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rates (phone TEXT PRIMARY KEY, base REAL NOT NULL, plus REAL NOT NULL)`);
    if (this.get('terms') === TERMS_WITH_PAY) this.put('terms', TERMS_DEFAULT);
    if (!this.sql.exec('PRAGMA table_info(menu)').toArray().some(c => c.name === 'pnp')) {
      // a menu from before PNP was kept: add it and mark the items the starting menu marks
      this.sql.exec('ALTER TABLE menu ADD COLUMN pnp INTEGER NOT NULL DEFAULT 0');
      for (const m of parseMenuCsv(JELOVNIK_CSV)) if (m.pnp) this.sql.exec('UPDATE menu SET pnp = 1 WHERE id = ?', m.id);
    }
    if (this.sql.exec('SELECT COUNT(*) AS n FROM menu').one().n === 0) this.writeMenu(parseMenuCsv(JELOVNIK_CSV));
    if (this.sql.exec('SELECT COUNT(*) AS n FROM slots').one().n === 0) this.insertSlots(parseSlotsCsv(TERMINI_CSV));
  }

  // ---- settings ----
  settings() {
    const out = { ...DEFAULTS };
    for (const r of this.sql.exec('SELECT k, v FROM settings').toArray()) if (r.k in DEFAULTS) out[r.k] = JSON.parse(r.v);
    return out;
  }
  put(k, v) { this.sql.exec('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, JSON.stringify(v)); }

  // ---- rate limits per IP ----
  limited(kind, ip) {
    const [max, per] = LIMITS[kind], k = `${kind}:${ip}`;
    const n = this.sql.exec('SELECT COUNT(*) AS n FROM limits WHERE k = ? AND at > ?', k, Date.now() - per).one().n;
    return n >= max;
  }
  hit(kind, ip) {
    this.sql.exec('DELETE FROM limits WHERE at < ?', Date.now() - DAY);   // IP addresses are kept one day at most
    this.sql.exec('INSERT INTO limits (k, at) VALUES (?, ?)', `${kind}:${ip}`, Date.now());
  }
  adminBlocked(ip) { return this.limited('admin_fail', ip); }
  adminFailed(ip) { this.hit('admin_fail', ip); }

  // ---- shifts ----
  slots() {
    return this.sql.exec(`SELECT s.id, s.day, s.block, s.start, s."end" AS "end", s.hours, s.capacity, s.note, s.event,
      (SELECT COUNT(*) FROM regs r WHERE r.slot_id = s.id) AS taken FROM slots s ORDER BY s.day, s.block`).toArray();
  }
  slot(id) {
    return this.sql.exec(`SELECT id, day, block, start, "end" AS "end", hours, capacity FROM slots WHERE id = ?`, id).toArray()[0] || null;
  }
  taken(id) { return this.sql.exec('SELECT COUNT(*) AS n FROM regs WHERE slot_id = ?', id).one().n; }
  insertSlots(list) {
    for (const s of list) {
      this.sql.exec(`INSERT INTO slots (id, day, block, start, "end", hours, capacity, note, event) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET day = excluded.day, block = excluded.block, start = excluded.start, "end" = excluded."end",
        hours = excluded.hours, capacity = excluded.capacity, note = excluded.note, event = excluded.event`,
        s.id, s.day, s.block, s.start, s.end, s.hours, s.capacity, s.note || '', s.event || '');
    }
  }
  personShifts(phone) {
    return this.sql.exec('SELECT s.id, s.day, s.block, s.hours FROM regs r JOIN slots s ON s.id = r.slot_id WHERE r.phone = ?', phone).toArray();
  }

  // ---- public ----
  publicState() {
    const st = this.settings();
    return {
      open: st.open, cancel_hours: st.cancel_hours, manual: st.manual, terms: st.terms, organizer: st.organizer,
      wipe_on: st.wipe_on, max_week: MAX_WEEK_HOURS, pupil_from: '2026-12-24', now: Date.now(),
      slots: this.slots().map(s => ({ ...s, free: Math.max(0, s.capacity - s.taken), taken: undefined })),
    };
  }

  // The checks and the writes happen in one synchronous transaction: nothing else runs in between.
  async signUp({ name, phone, kind, slots: ids }, ip) {
    if (this.limited('signup', ip)) return { status: 429, error: 'too_many' };
    this.hit('signup', ip);
    const res = this.ctx.storage.transactionSync(() => {
      const st = this.settings();
      if (!st.open) return { status: 409, error: 'closed' };
      const chosen = ids.map(id => this.slot(id));
      if (chosen.some(s => !s)) return { status: 409, error: 'unknown_slot' };
      const now = Date.now();
      for (const s of chosen) {
        if (slotStartMs(s) <= now) return { status: 409, error: 'past', slot: s.id };
        if (this.taken(s.id) >= s.capacity) return { status: 409, error: 'full', slot: s.id };
      }
      const bad = checkChoice(this.personShifts(phone), chosen, kind);
      if (bad) return { status: 409, ...bad };
      const token = newToken(), status = st.manual ? 'pending' : 'confirmed';
      for (const s of chosen) {
        this.sql.exec(`INSERT INTO regs (slot_id, phone, name, token, status, source, created, kind) VALUES (?, ?, ?, ?, ?, 'web', ?, ?)`,
          s.id, phone, name, token, status, now, kind);
      }
      return { token };
    });
    if (res.error) return { ...res, state: this.publicState() };
    await this.scheduleWipe();
    return { ...this.mine(res.token), token: res.token };
  }

  mine(token) {
    const st = this.settings(), now = Date.now();
    const regs = this.sql.exec(`SELECT r.id, r.name, r.status, r.kind, s.id AS slot_id, s.day, s.block, s.start, s."end" AS "end", s.hours
      FROM regs r JOIN slots s ON s.id = r.slot_id WHERE r.token = ? ORDER BY s.day, s.block`, token).toArray()
      .map(r => ({ ...r, can_cancel: now < slotStartMs(r) - st.cancel_hours * HOUR }));
    return { regs, name: regs[0]?.name || '', kind: regs[0]?.kind || '', cancel_hours: st.cancel_hours, manual: st.manual };
  }
  mineChecked(token, ip) {
    if (this.limited('mine', ip)) return { status: 429, error: 'too_many' };
    this.hit('mine', ip);
    return this.mine(token);
  }

  cancel(token, id, ip) {
    if (this.limited('cancel', ip)) return { status: 429, error: 'too_many' };
    this.hit('cancel', ip);
    const r = this.sql.exec(`SELECT r.id, s.day, s.start FROM regs r JOIN slots s ON s.id = r.slot_id WHERE r.id = ? AND r.token = ?`, id, token).toArray()[0];
    if (!r) return { status: 404, error: 'not_found' };
    if (Date.now() >= slotStartMs(r) - this.settings().cancel_hours * HOUR) return { status: 409, error: 'too_late' };
    this.sql.exec('DELETE FROM regs WHERE id = ?', id);
    return this.mine(token);
  }

  // ---- organizer ----
  adminData() {
    const regs = this.sql.exec(`SELECT r.id, r.slot_id, r.name, r.phone, r.status, r.source, r.created, r.token, r.kind, s.day, s.block, s.start, s.hours
      FROM regs r JOIN slots s ON s.id = r.slot_id ORDER BY s.day, s.block, r.created`).toArray();
    return {
      extras: this.sql.exec(`SELECT id, day, name, start, "end" AS "end", label FROM extras ORDER BY day, start`).toArray(),
      tg_chats: (this.get('tg_chats') || []).length,
      settings: this.settings(), max_week: MAX_WEEK_HOURS, pay: { base: PAY_BASE, plus: PAY_PLUS }, slots: this.slots(),
      regs: regs.map(r => ({ ...r, phone_fmt: formatPhone(r.phone), day: undefined, hours: undefined, block: undefined, start: undefined })),
      people: this.people(regs),
    };
  }
  // one per phone number: hours per ISO week, in total, and for the payroll (regular / +50 %, per calendar year)
  people(regs) {
    const people = {}, rates = {};
    for (const r of this.sql.exec('SELECT phone, base, plus FROM rates').toArray()) rates[r.phone] = r;
    for (const r of regs) {
      const p = people[r.phone] ||= { phone: r.phone, phone_fmt: formatPhone(r.phone), name: r.name, kind: r.kind, shifts: [], total: 0, pay: {} };
      p.name = r.name; p.kind = r.kind;
      p.shifts.push({ id: r.slot_id, day: r.day, hours: r.hours });
      p.total = Math.round((p.total + r.hours) * 10) / 10;
      for (const [y, h] of Object.entries(payHours(r))) {
        const t = p.pay[y] ||= { reg: 0, plus: 0 };
        t.reg += h.reg; t.plus += h.plus;
      }
    }
    for (const p of Object.values(people)) {
      p.weeks = weekHours(p.shifts);
      p.over = Object.values(p.weeks).some(h => h > MAX_WEEK_HOURS);
      const rate = rates[p.phone] || { base: PAY_BASE, plus: PAY_PLUS };
      p.rate = { base: rate.base, plus: rate.plus, own: !!rates[p.phone] };
      p.net = Math.round(Object.values(p.pay).reduce((s, h) => s + h.reg * rate.base + h.plus * rate.plus, 0) * 100) / 100;
    }
    return Object.values(people).sort((a, b) => a.name.localeCompare(b.name, 'hr'));
  }
  payrollRows() {
    return this.people(this.sql.exec(`SELECT r.slot_id, r.name, r.phone, r.kind, s.day, s.block, s.start, s.hours
      FROM regs r JOIN slots s ON s.id = r.slot_id ORDER BY s.day, s.block`).toArray());
  }
  async saveSettings(v) {
    const cur = this.settings();
    for (const k of Object.keys(DEFAULTS)) if (v[k] !== undefined) this.put(k, v[k]);
    if (v.wipe_on !== undefined && v.wipe_on !== cur.wipe_on) this.put('wiped_for', null);
    await this.scheduleWipe();
    return this.adminData();
  }

  setCapacity(id, capacity) {
    if (!this.slot(id)) return { status: 404, error: 'not_found' };
    this.sql.exec('UPDATE slots SET capacity = ? WHERE id = ?', capacity, id);
    return this.adminData();
  }

  importSlots(list) {
    return this.ctx.storage.transactionSync(() => {
      const ids = new Set(list.map(s => s.id));
      const orphans = this.sql.exec('SELECT DISTINCT slot_id FROM regs').toArray().map(r => r.slot_id).filter(id => !ids.has(id));
      if (orphans.length) return { status: 409, error: 'slots_in_use', slots: orphans };
      for (const r of this.sql.exec('SELECT id FROM slots').toArray()) if (!ids.has(r.id)) this.sql.exec('DELETE FROM slots WHERE id = ?', r.id);
      this.insertSlots(list);
      return this.adminData();
    });
  }

  // force: add even if the shift is full or the person would break a rule (the organizer decides)
  addReg({ slot, name, phone, kind, force }) {
    const res = this.ctx.storage.transactionSync(() => {
      const s = this.slot(slot);
      if (!s) return { status: 404, error: 'unknown_slot' };
      if (this.sql.exec('SELECT 1 FROM regs WHERE slot_id = ? AND phone = ?', slot, phone).toArray().length) return { status: 409, error: 'already' };
      if (!force) {
        if (this.taken(slot) >= s.capacity) return { status: 409, error: 'full', slot };
        const bad = checkChoice(this.personShifts(phone), [s], kind);
        if (bad) return { status: 409, ...bad };
      }
      // the person's existing private link, so the organizer can send one link for all their shifts
      const prev = this.sql.exec('SELECT token FROM regs WHERE phone = ? ORDER BY created DESC LIMIT 1', phone).toArray()[0];
      this.sql.exec(`INSERT INTO regs (slot_id, phone, name, token, status, source, created, kind) VALUES (?, ?, ?, ?, 'confirmed', 'admin', ?, ?)`,
        slot, phone, name, prev ? prev.token : newToken(), Date.now(), kind);
      return null;
    });
    return res || this.adminData();
  }
  removeReg(id) { this.sql.exec('DELETE FROM regs WHERE id = ?', id); return this.adminData(); }
  confirmReg(id) { this.sql.exec(`UPDATE regs SET status = 'confirmed' WHERE id = ?`, id); return this.adminData(); }

  exportRows() {
    return this.sql.exec(`SELECT s.day, s.block, s.start, s."end" AS "end", s.hours, r.name, r.phone, r.status, r.created, r.kind
      FROM regs r JOIN slots s ON s.id = r.slot_id ORDER BY s.day, s.block, r.name`).toArray();
  }

  // ---- QR orders ----
  menu() {
    return this.sql.exec('SELECT id, cat, name, descr, price, allergens, available, alcohol, pnp FROM menu ORDER BY sort').toArray()
      .map(m => ({ ...m, available: !!m.available, alcohol: !!m.alcohol, pnp: !!m.pnp }));
  }
  writeMenu(items) {
    this.sql.exec('DELETE FROM menu');
    items.forEach((m, i) => this.sql.exec(`INSERT INTO menu (id, sort, cat, name, descr, price, allergens, available, alcohol, pnp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, m.id, i, m.cat, m.name, m.descr, m.price, m.allergens, m.available ? 1 : 0, m.alcohol ? 1 : 0, m.pnp ? 1 : 0));
  }
  saveMenu(items) { this.ctx.storage.transactionSync(() => this.writeMenu(items)); return this.menu(); }
  setAvailable(id, on) { this.sql.exec('UPDATE menu SET available = ? WHERE id = ?', on ? 1 : 0, id); return this.staffData(); }

  menuPublic() {
    return { open: this.settings().orders_open, items: this.menu().filter(m => m.available) };
  }

  async placeOrder({ lines, pay, name, note, adult }, ip) {
    if (this.limited('order', ip)) return { status: 429, error: 'too_many' };
    this.hit('order', ip);
    const res = this.ctx.storage.transactionSync(() => {
      if (!this.settings().orders_open) return { status: 409, error: 'closed' };
      const p = priceOrder(lines, this.menu());
      if (p.error) return { status: 409, ...p, menu: this.menuPublic() };
      if (p.alcohol && !adult) return { status: 400, error: 'adult' };   // the staff still checks ID at pick-up
      const day = businessDay(), now = Date.now(), token = newToken();
      const num = this.sql.exec('SELECT COALESCE(MAX(num), 0) + 1 AS n FROM orders WHERE day = ?', day).one().n;
      this.sql.exec(`INSERT INTO orders (day, num, token, items, total, alcohol, pay, name, note, status, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'nova', ?, ?)`, day, num, token, JSON.stringify(p.items), p.total, p.alcohol ? 1 : 0, pay, name, note, now, now);
      return { token };
    });
    return res.error ? res : { ...this.orderView(res.token), token: res.token };
  }

  orderView(token) {
    const o = this.sql.exec('SELECT * FROM orders WHERE token = ?', token).toArray()[0];
    if (!o) return { status: 404, error: 'not_found' };
    const ahead = o.status === 'nova' || o.status === 'priprema'
      ? this.sql.exec(`SELECT COUNT(*) AS n FROM orders WHERE status IN ('nova', 'priprema') AND created < ?`, o.created).one().n : 0;
    return { num: o.num, day: o.day, status: o.status, items: JSON.parse(o.items), total: o.total, pay: o.pay, name: o.name,
      alcohol: !!o.alcohol, created: o.created, updated: o.updated, ahead };
  }
  orderViewChecked(token, ip) {
    if (this.limited('order_view', ip)) return { status: 429, error: 'too_many' };
    this.hit('order_view', ip);
    return this.orderView(token);
  }
  // the guest can cancel while the order has not been started
  cancelOrder(token) {
    const o = this.sql.exec('SELECT id, status FROM orders WHERE token = ?', token).toArray()[0];
    if (!o) return { status: 404, error: 'not_found' };
    if (o.status !== 'nova') return { status: 409, error: 'started' };
    this.sql.exec(`UPDATE orders SET status = 'otkazano', updated = ? WHERE id = ?`, Date.now(), o.id);
    return this.orderView(token);
  }

  // the hut's screen: everything still open, and what was finished in the last 2 hours
  staffData() {
    const rows = this.sql.exec(`SELECT id, day, num, items, total, alcohol, pay, name, note, status, created, updated FROM orders
      WHERE status IN ('nova', 'priprema', 'spremno') OR updated > ? ORDER BY created`, Date.now() - 2 * HOUR).toArray();
    return { open: this.settings().orders_open, now: Date.now(), menu: this.menu(),
      orders: rows.map(o => ({ ...o, items: JSON.parse(o.items), alcohol: !!o.alcohol })) };
  }
  setOrderStatus(id, status) {
    this.sql.exec('UPDATE orders SET status = ?, updated = ? WHERE id = ?', status, Date.now(), id);
    return this.staffData();
  }
  setOrdersOpen(open) { this.put('orders_open', !!open); return this.staffData(); }

  // per day: orders, collected total (picked up), and how many of each item
  ordersSummary() {
    const days = {};
    for (const o of this.sql.exec('SELECT day, items, total, status FROM orders ORDER BY day DESC').toArray()) {
      const d = days[o.day] ||= { day: o.day, orders: 0, cancelled: 0, total: 0, items: {} };
      if (o.status === 'otkazano') { d.cancelled++; continue; }
      d.orders++;
      if (o.status === 'preuzeto') d.total = Math.round((d.total + o.total) * 100) / 100;
      for (const i of JSON.parse(o.items)) d.items[i.name] = (d.items[i.name] || 0) + i.qty;
    }
    return { days: Object.values(days), menu: this.menu(), open: this.settings().orders_open };
  }
  exportOrders() { return this.sql.exec('SELECT day, num, items, total, pay, status, created FROM orders ORDER BY created').toArray(); }

  setRate(phone, base, plus) {
    if (base === null) this.sql.exec('DELETE FROM rates WHERE phone = ?', phone);
    else this.sql.exec('INSERT INTO rates (phone, base, plus) VALUES (?, ?, ?) ON CONFLICT(phone) DO UPDATE SET base = excluded.base, plus = excluded.plus', phone, base, plus);
    return this.adminData();
  }

  // ---- extra shifts outside the blocks (organizer only) ----
  addExtras(name, days, ranges) {
    this.ctx.storage.transactionSync(() => {
      for (const d of days) for (const r of ranges) {
        this.sql.exec(`INSERT INTO extras (day, name, start, "end", label) VALUES (?, ?, ?, ?, ?)`, d, name, r.start, r.end, r.label);
      }
    });
    return this.adminData();
  }
  removeExtras(ids) { for (const id of ids) this.sql.exec('DELETE FROM extras WHERE id = ?', id); return this.adminData(); }

  // ---- Telegram: chats that get a message for every new order ----
  telegramChats() { return this.get('tg_chats') || []; }
  saveTelegramChats(list) { this.put('tg_chats', list); return list; }

  // ---- privacy: names and phones are deleted on wipe_on (or now, from /admin) ----
  wipe() {
    this.sql.exec('DELETE FROM extras');
    this.sql.exec('DELETE FROM rates');
    this.sql.exec(`UPDATE orders SET name = '', note = ''`);
    this.sql.exec('DELETE FROM regs');
    this.sql.exec('DELETE FROM limits');
    return this.adminData();
  }
  wipeMs() { const d = this.settings().wipe_on; return isDay(d) ? Date.parse(d + 'T00:00:00+01:00') : null; }
  async scheduleWipe() {
    const at = this.wipeMs();
    if (at && this.get('wiped_for') !== this.settings().wipe_on) await this.ctx.storage.setAlarm(Math.max(at, Date.now() + MINUTE));
    else await this.ctx.storage.deleteAlarm();
  }
  get(k) { const r = this.sql.exec('SELECT v FROM settings WHERE k = ?', k).toArray()[0]; return r ? JSON.parse(r.v) : null; }
  async alarm() {
    const at = this.wipeMs();
    if (at && Date.now() >= at) {
      this.wipe();
      this.put('wiped_for', this.settings().wipe_on);
      this.put('open', false);
    } else await this.scheduleWipe();
  }
}

// ---- HTTP ----
const SEC = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' };
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC },
});
const page = (html, robots) => new Response(html, {
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SEC, ...(robots ? { 'X-Robots-Tag': robots } : {}) },
});
// ---- Telegram (optional): TELEGRAM_BOT_TOKEN, chats connected in /admin → Jelovnik ----
async function telegram(env, method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}),
  });
  return r.json().catch(() => ({}));
}
async function notifyOrder(env, store, origin, o) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const chats = await store.telegramChats();
  if (!chats.length) return;
  const eur = n => n.toFixed(2).replace('.', ',') + ' €';
  const text = `🛎 Nova narudžba #${o.num}\n` + o.items.map(i => `${i.qty}× ${i.name}`).join('\n') +
    `\n${eur(o.total)} · ${o.pay === 'kartica' ? 'kartica (blagajna s karticom)' : 'gotovina'}` +
    (o.name ? `\nIme: ${o.name}` : '') + (o.note ? `\nNapomena: ${o.note}` : '') +
    (o.alcohol ? '\n⚠️ 18+ provjeri osobnu' : '') + `\n${origin}/kuhinja`;
  await Promise.all(chats.map(c => telegram(env, 'sendMessage', { chat_id: c.id, text }).catch(() => {})));
}

// "08:00-09:00 Nabava; 09:00-12:00 Otvaranje" → [{start, end, label}]
function parseRanges(v) {
  const out = [];
  for (const part of String(v || '').split(/[;\n]/).map(s => s.trim()).filter(Boolean)) {
    const m = /^(\d{1,2})[:.](\d{2})\s*[–—-]\s*(\d{1,2})[:.](\d{2})\s*(.*)$/.exec(part);
    if (!m) return null;
    const start = `${m[1].padStart(2, '0')}:${m[2]}`, end = `${m[3].padStart(2, '0')}:${m[4]}`;
    if (+m[1] > 23 || +m[3] > 24 || +m[2] > 59 || +m[4] > 59 || end <= start) return null;
    out.push({ start, end, label: str(m[5], 40) });
  }
  return out.length && out.length <= 6 ? out : null;
}

// HTTP status of a Store result: errors carry a number; an order's own "status" is a word (nova, priprema…)
const code = r => (typeof r.status === 'number' ? r.status : 200);
async function body(req) { try { return await req.json(); } catch { return null; } }

function sameString(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

function validSettings(b) {
  if (!b || typeof b !== 'object') return null;
  const out = {};
  if ('open' in b) out.open = !!b.open;
  if ('orders_open' in b) out.orders_open = !!b.orders_open;
  if ('manual' in b) out.manual = !!b.manual;
  if ('cancel_hours' in b) { const n = Number(b.cancel_hours); if (!Number.isInteger(n) || n < 0 || n > 24 * 30) return null; out.cancel_hours = n; }
  if ('terms' in b) out.terms = text(b.terms, 2000);
  if ('organizer' in b) out.organizer = text(b.organizer, 400);
  if ('wipe_on' in b) { if (!isDay(b.wipe_on)) return null; out.wipe_on = b.wipe_on; }
  return out;
}

const DAYS_HR = ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'];
const hrDate = d => `${+d.slice(8, 10)}.${+d.slice(5, 7)}.${d.slice(0, 4)}.`;
function exportCsv(rows) {
  const q = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const out = [['Datum', 'Dan', 'Tjedan', 'Blok', 'Vrijeme', 'Sati', 'Ime i prezime', 'Mobitel', 'Servis', 'Status', 'Prijavljeno']];
  for (const r of rows) {
    out.push([hrDate(r.day), DAYS_HR[new Date(r.day + 'T12:00:00Z').getUTCDay()], isoWeek(r.day).slice(-2), r.block,
      `${r.start}–${r.end}`, String(r.hours).replace('.', ','), r.name, formatPhone(r.phone), KIND_HR[r.kind] || r.kind,
      r.status === 'pending' ? 'čeka potvrdu' : 'potvrđeno',
      new Date(r.created).toLocaleString('hr-HR', { timeZone: 'Europe/Zagreb' })]);
  }
  // semicolons and a BOM: Excel with Croatian settings opens it with the right columns and letters
  return '﻿' + out.map(r => r.map(q).join(';')).join('\r\n') + '\r\n';
}

const KIND_HR = { student: 'Student (SCRI)', ucenik: 'Učenik (Dom mladih)', drugo: 'Drugo' };
// Hours for the services' payroll: per person and calendar year (December and January are settled separately),
// regular and +50 % (night 22–06, Sundays, holidays), with an estimate of the net pay.
function payrollCsv(people) {
  const q = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const n = v => String(Math.round(v * 100) / 100).replace('.', ',');
  const out = [['Ime i prezime', 'Mobitel', 'Servis', 'Godina', 'Redovni sati', 'Sati +50 %', 'Ukupno sati',
    'Satnica (EUR/h)', 'Satnica +50 % (EUR/h)', 'Procjena neto (EUR)']];
  for (const p of people) {
    for (const [y, h] of Object.entries(p.pay).sort()) {
      out.push([p.name, p.phone_fmt, KIND_HR[p.kind] || p.kind, y, n(h.reg), n(h.plus), n(h.reg + h.plus),
        n(p.rate.base), n(p.rate.plus), n(h.reg * p.rate.base + h.plus * p.rate.plus)]);
    }
  }
  return '\uFEFF' + out.map(r => r.map(q).join(';')).join('\r\n') + '\r\n';
}

// For the organizer's workbook (sheet "Prijave", columns A–C from row 5): name, date as 2026-12-10
// (Excel reads that as a date in every language, so the sheet's formulas match it) and block.
function sheetCsv(rows) {
  const q = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const out = [['Ime i prezime', 'Datum', 'Blok'], ...rows.map(r => [r.name, r.day, r.block])];
  return '\uFEFF' + out.map(r => r.map(q).join(';')).join('\r\n') + '\r\n';
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    const store = env.STORE.get(env.STORE.idFromName('main'));
    const ip = request.headers.get('CF-Connecting-IP') || 'local';

    if (method === 'GET' && (path === '/' || path === '/index.html')) return page(PUBLIC_PAGE);
    if (method === 'GET' && /^\/moji\/[\w-]{16,40}$/.test(path)) return page(PUBLIC_PAGE, 'noindex');
    if (method === 'GET' && path === '/admin') return page(ADMIN_PAGE, 'noindex');
    if (method === 'GET' && path === '/meni') return page(MENU_PAGE);
    if (method === 'GET' && /^\/narudzba\/[\w-]{16,40}$/.test(path)) return page(MENU_PAGE, 'noindex');
    if (method === 'GET' && path === '/kuhinja') return page(KITCHEN_PAGE, 'noindex');
    if (method === 'GET' && path === '/robots.txt') return new Response('User-agent: *\nDisallow: /moji/\nDisallow: /narudzba/\nDisallow: /kuhinja\nDisallow: /admin\nDisallow: /api/\n');

    // QR codes: /qr.svg|png → the sign-up page, /qr-meni.svg|png → the menu for orders
    let m = path.match(/^\/qr(-meni)?\.(svg|png)$/);
    if (m && method === 'GET') {
      const base = env.PUBLIC_URL || `${url.origin}/`;
      const target = m[1] ? new URL('meni', base).href : base;
      const file = `qr-${m[1] ? 'meni' : 'prijave'}.${m[2]}`;
      if (m[2] === 'svg') return new Response(qrSvg(target), { headers: { 'Content-Type': 'image/svg+xml', 'Content-Disposition': `inline; filename="${file}"` } });
      const scale = Math.min(80, Math.max(10, parseInt(url.searchParams.get('scale')) || 40));
      return new Response(await qrPng(target, scale), { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `inline; filename="${file}"` } });
    }

    // ---- QR orders (guests) ----
    if (path === '/api/meni' && method === 'GET') return json(await store.menuPublic());
    if (path === '/api/narudzba' && method === 'POST') {
      const b = await body(request);
      if (!b || typeof b !== 'object' || b.website) return json({ error: 'invalid' }, 400);
      if (!PAY.includes(b.pay)) return json({ error: 'pay' }, 400);
      const name = str(b.name, 30), note = str(b.note, 140);
      const res = await store.placeOrder({ lines: b.items, pay: b.pay, name, note, adult: b.adult === true }, ip);
      if (res.token) ctx.waitUntil(notifyOrder(env, store, url.origin, { ...res, note }).catch(() => {}));
      return json(res, code(res));
    }
    m = path.match(/^\/api\/narudzba\/([\w-]{16,40})(\/otkazi)?$/);
    if (m && !m[2] && method === 'GET') { const res = await store.orderViewChecked(m[1], ip); return json(res, code(res)); }
    if (m && m[2] && method === 'POST') { const res = await store.cancelOrder(m[1]); return json(res, code(res)); }

    // ---- the hut's order screen (X-Staff-Pin = STAFF_PIN, or the organizer's password) ----
    if (path.startsWith('/api/osoblje/')) {
      if (!env.STAFF_PIN && !env.ADMIN_PASSWORD) return json({ error: 'no_password' }, 503);
      if (await store.adminBlocked(ip)) return json({ error: 'too_many' }, 429);
      const pin = request.headers.get('X-Staff-Pin') || '';
      if (!((env.STAFF_PIN && sameString(pin, env.STAFF_PIN)) || (env.ADMIN_PASSWORD && sameString(pin, env.ADMIN_PASSWORD)))) {
        await store.adminFailed(ip);
        return json({ error: 'password' }, 401);
      }
      const route = path.slice('/api/osoblje/'.length);
      if (route === 'narudzbe' && method === 'GET') return json(await store.staffData());
      if (route === 'otvoreno' && method === 'POST') return json(await store.setOrdersOpen(!!(await body(request))?.open));
      let r = route.match(/^narudzbe\/(\d+)$/);
      if (r && method === 'POST') {
        const st = (await body(request))?.status;
        if (!STATUSES.includes(st)) return json({ error: 'invalid' }, 400);
        return json(await store.setOrderStatus(+r[1], st));
      }
      r = route.match(/^meni\/([A-Za-z0-9]{1,12})$/);
      if (r && method === 'POST') return json(await store.setAvailable(r[1].toUpperCase(), !!(await body(request))?.available));
      return json({ error: 'not_found' }, 404);
    }

    if (path === '/api/stanje' && method === 'GET') return json(await store.publicState());

    if (path === '/api/prijava' && method === 'POST') {
      const b = await body(request);
      if (!b || typeof b !== 'object') return json({ error: 'invalid' }, 400);
      if (b.website) return json({ error: 'invalid' }, 400);                        // honeypot: people never see this field
      if (b.adult !== true) return json({ error: 'adult' }, 400);
      if (b.consent !== true) return json({ error: 'consent' }, 400);
      const name = validName(b.name);
      if (!name) return json({ error: 'name' }, 400);
      const phone = normalizePhone(b.phone);
      if (!phone) return json({ error: 'phone' }, 400);
      if (b.kind !== 'student' && b.kind !== 'ucenik') return json({ error: 'kind' }, 400);
      const ids = Array.isArray(b.slots) ? [...new Set(b.slots.map(String))] : [];
      if (!ids.length || ids.length > 40 || ids.some(id => !/^\d{4}-\d{2}-\d{2}-[AB]$/.test(id))) return json({ error: 'no_slots' }, 400);
      const res = await store.signUp({ name, phone, kind: b.kind, slots: ids }, ip);
      return json(res, res.status || 200);
    }

    m = path.match(/^\/api\/moji\/([\w-]{16,40})(\/otkazi)?$/);
    if (m && !m[2] && method === 'GET') { const res = await store.mineChecked(m[1], ip); return json(res, res.status || 200); }
    if (m && m[2] && method === 'POST') {
      const id = Number((await body(request))?.id);
      if (!Number.isInteger(id)) return json({ error: 'invalid' }, 400);
      const res = await store.cancel(m[1], id, ip);
      return json(res, res.status || 200);
    }

    if (path.startsWith('/api/admin/')) {
      if (!env.ADMIN_PASSWORD) return json({ error: 'no_password' }, 503);
      if (await store.adminBlocked(ip)) return json({ error: 'too_many' }, 429);
      if (!sameString(request.headers.get('X-Admin-Password') || '', env.ADMIN_PASSWORD)) {
        await store.adminFailed(ip);
        return json({ error: 'password' }, 401);
      }
      const route = path.slice('/api/admin/'.length);
      if (route === 'data' && method === 'GET') return json(await store.adminData());
      if (route === 'export.csv' && method === 'GET') {
        return new Response(exportCsv(await store.exportRows()), { headers: {
          'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Disposition': 'attachment; filename="prijave-advent-2026.csv"' } });
      }
      if (route === 'obracun.csv' && method === 'GET') {
        return new Response(payrollCsv(await store.payrollRows()), { headers: {
          'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Disposition': 'attachment; filename="obracun-sati-advent-2026.csv"' } });
      }
      if (route === 'export-tablica.csv' && method === 'GET') {
        return new Response(sheetCsv(await store.exportRows()), { headers: {
          'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Disposition': 'attachment; filename="prijave-za-tablicu.csv"' } });
      }
      if (route === 'meni' && method === 'GET') return json({ ...(await store.ordersSummary()), tg_token: !!env.TELEGRAM_BOT_TOKEN, tg_chats: (await store.telegramChats()).length });
      // Telegram: everyone who has written to the bot is connected and gets a test message
      if (route === 'telegram' && method === 'POST') {
        if (!env.TELEGRAM_BOT_TOKEN) return json({ error: 'no_token' }, 400);
        const up = await telegram(env, 'getUpdates', {}).catch(() => ({}));
        if (!up.ok) return json({ error: 'bad_token' }, 400);
        const chats = await store.telegramChats();
        for (const u of up.result || []) {
          const c = (u.message || u.my_chat_member || {}).chat;
          if (c && !chats.some(x => x.id === c.id)) chats.push({ id: c.id, name: str(c.first_name || c.title || c.username || '', 60) });
        }
        await store.saveTelegramChats(chats);
        await Promise.all(chats.map(c => telegram(env, 'sendMessage', { chat_id: c.id, text: '✅ Obavijesti o narudžbama s jelovnika su uključene.' }).catch(() => {})));
        return json({ chats: chats.map(c => c.name) });
      }
      if (route === 'telegram' && method === 'DELETE') { await store.saveTelegramChats([]); return json({ chats: [] }); }
      if (route === 'rate' && method === 'POST') {
        const b = await body(request) || {};
        const phone = normalizePhone(b.phone);
        if (!phone) return json({ error: 'phone' }, 400);
        if (b.base === null || b.base === '') return json(await store.setRate(phone, null, null));
        const base = Math.round(Number(String(b.base).replace(',', '.')) * 100) / 100;
        const plus = b.plus === '' || b.plus == null ? Math.round(base * 1.5 * 100) / 100 : Math.round(Number(String(b.plus).replace(',', '.')) * 100) / 100;
        if (!(base > 0 && base < 200 && plus > 0 && plus < 300)) return json({ error: 'invalid' }, 400);
        return json(await store.setRate(phone, base, plus));
      }
      if (route === 'extras' && method === 'POST') {
        const b = await body(request) || {};
        const name = str(b.name, 40), ranges = parseRanges(b.times);
        const from = parseDate(b.from || ''), to = parseDate(b.to || '');
        if (name.length < 2 || !ranges || !from || !to || to < from) return json({ error: 'invalid' }, 400);
        const skip = new Set(String(b.skip || '').split(/[,;\s]+/).map(x => x && parseDate(x)).filter(Boolean));
        const days = [];
        for (let d = from; d <= to && days.length < 60; d = addDays(d, 1)) if (!skip.has(d)) days.push(d);
        return json(await store.addExtras(name, days, ranges));
      }
      if (route === 'extras/delete' && method === 'POST') {
        const ids = (await body(request))?.ids;
        if (!Array.isArray(ids) || ids.some(x => !Number.isInteger(x))) return json({ error: 'invalid' }, 400);
        return json(await store.removeExtras(ids));
      }
      if (route === 'meni' && method === 'POST') {
        const list = (await body(request))?.items;
        const items = Array.isArray(list) && list.length <= 100 ? list.map((x, i) => validItem(x, i)) : null;
        if (!items || !items.length || items.some(x => !x) || new Set(items.map(x => x.id)).size !== items.length) return json({ error: 'invalid' }, 400);
        await store.saveMenu(items);
        return json(await store.ordersSummary());
      }
      if (route === 'meni/import' && method === 'POST') {
        let items;
        try { items = parseMenuCsv((await body(request))?.csv || ''); } catch (e) { return json({ error: 'csv', message: e.message }, 400); }
        await store.saveMenu(items);
        return json(await store.ordersSummary());
      }
      if (route === 'freshpay.xlsx' && method === 'GET') {
        const file = await xlsx('Sheet1', [FRESHPAY_HEAD, ...freshPayRows((await store.ordersSummary()).menu)]);
        return new Response(file, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="FreshPay-artikli-Echoes.xlsx"' } });
      }
      if (route === 'narudzbe.csv' && method === 'GET') {
        return new Response(ordersCsv(await store.exportOrders()), { headers: {
          'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Disposition': 'attachment; filename="narudzbe-advent-2026.csv"' } });
      }
      if (route === 'settings' && method === 'POST') {
        const s = validSettings(await body(request));
        return s ? json(await store.saveSettings(s)) : json({ error: 'invalid' }, 400);
      }
      if (route === 'import' && method === 'POST') {
        let list;
        try { list = parseSlotsCsv((await body(request))?.csv || ''); } catch (e) { return json({ error: 'csv', message: e.message }, 400); }
        const res = await store.importSlots(list);
        return json(res, res.status || 200);
      }
      if (route === 'wipe' && method === 'POST') {
        if ((await body(request))?.confirm !== 'OBRIŠI') return json({ error: 'invalid' }, 400);
        return json(await store.wipe());
      }
      if (route === 'regs' && method === 'POST') {
        const b = await body(request) || {};
        const name = validName(b.name), phone = normalizePhone(b.phone);
        if (!name) return json({ error: 'name' }, 400);
        if (!phone) return json({ error: 'phone' }, 400);
        const kind = KINDS.includes(b.kind) ? b.kind : 'drugo';
        const res = await store.addReg({ slot: String(b.slot || ''), name, phone, kind, force: !!b.force });
        return json(res, res.status || 200);
      }
      m = route.match(/^regs\/(\d+)(\/confirm)?$/);
      if (m && !m[2] && method === 'DELETE') return json(await store.removeReg(+m[1]));
      if (m && m[2] && method === 'POST') return json(await store.confirmReg(+m[1]));
      m = route.match(/^slots\/(\d{4}-\d{2}-\d{2}-[AB])$/);
      if (m && method === 'POST') {
        const cap = Number((await body(request))?.capacity);
        if (!Number.isInteger(cap) || cap < 0 || cap > 50) return json({ error: 'invalid' }, 400);
        const res = await store.setCapacity(m[1], cap);
        return json(res, res.status || 200);
      }
      return json({ error: 'not_found' }, 404);
    }

    return json({ error: 'not_found' }, 404);
  },
};
