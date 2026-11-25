// Rules shared by the Worker and the tests: phone numbers, ISO weeks, the starting shifts,
// the CSV of shifts, and the check of a person's choice (one block a day, at most 30 hours a week).

export const MAX_WEEK_HOURS = 30;

// Who works through which service (from the organizer's plan "Plan, ugovori i proračun"):
//   student: Student servis Rijeka (SCRI), any day;
//   ucenik:  adult secondary-school pupil, Učenički servis Dom mladih Rijeka, only in the winter holidays (from 24.12.);
//   drugo:   the organizer and friends, added in /admin, no service.
export const KINDS = ['student', 'ucenik', 'drugo'];
export const PUPIL_FROM = '2026-12-24';
// Pay (net per hour): base, and +50 % at night (22–06), on Sundays and on public holidays
export const PAY_BASE = 11.15, PAY_PLUS = 16.73;
export const HOLIDAYS = ['2026-12-25', '2026-12-26', '2027-01-01'];

// ---- phone numbers: one person = one normalized mobile number ----
// "091 234 5678", "+385 91 234 5678", "00385912345678" and "385912345678" are all "+385912345678"
export function normalizePhone(v) {
  let s = String(v ?? '').replace(/[\s\-\/().]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  else if (/^385\d{8,9}$/.test(s)) s = '+' + s;
  else if (/^0\d{8,10}$/.test(s)) s = '+385' + s.slice(1);
  else if (/^9\d{7,8}$/.test(s)) s = '+385' + s;
  if (s.startsWith('+3850')) s = '+385' + s.slice(5);       // "+385 (0)91 …"
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
  if (s.startsWith('+385') && !/^\+3859\d{7,8}$/.test(s)) return null;   // Croatian numbers must be mobile (9x)
  return s;
}

// "+385912345678" → "091 234 5678" (for the organizer's lists and the export)
export function formatPhone(p) {
  const m = /^\+385(9\d)(\d{3})(\d{3,4})$/.exec(p || '');
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : p;
}

// ---- ISO weeks: 10.12.2026–02.01.2027 are weeks 50, 51, 52 and 53 of 2026 ----
export function isoWeek(day) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7 + 3);   // Thursday of the same week decides the year
  const year = d.getUTCFullYear();
  const week = 1 + Math.floor((d - Date.UTC(year, 0, 1)) / 86400000 / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export const isDay = v => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === v;
};
export const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
// hours between two times; a shift that ends at or before it starts ends the next day (16:00–03:00 = 11 h)
export const hoursBetween = (start, end) => { let m = toMin(end) - toMin(start); if (m <= 0) m += 24 * 60; return Math.round(m / 6) / 10; };

// Shift start as a timestamp. December and January are always winter time in Croatia (UTC+1).
export const slotStartMs = s => Date.parse(`${s.day}T${s.start}:00+01:00`);

export function makeSlot(day, block, start, end, capacity, hours, note = '', event = '') {
  return { id: `${day}-${block}`, day, block, start, end, hours: hours || hoursBetween(start, end), capacity, note, event };
}

// ---- the organizer's CSV of shifts ----
// The columns are recognized by their headings (any order, ";" or "," or tab):
//   Datum (10.12.2026. / 2026-12-10 / 10.12.), Blok (A/B), Od + Do or Vrijeme ("09:00–16:00"), Sati, Mjesta,
//   optional Tip dana ("Koncert" is shown to the students) and Događaj (what is on at the square that day). Other columns (Dan, Naziv termina) are ignored.
// Without Blok the block follows from the start time (before noon = A). Without Sati the hours follow from the times.
const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim();

function splitCsvLine(lineText, sep) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < lineText.length; i++) {
    const c = lineText[i];
    if (q) { if (c === '"' && lineText[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export function parseDate(v) {
  const s = String(v).trim().replace(/\.$/, '');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return fmtDay(+m[1], +m[2], +m[3]);
  m = /(?:^|\s)(\d{1,2})\.\s*(\d{1,2})\.?\s*(\d{4})?$/.exec(s);       // "čet 10.12.2026" too
  if (m) return fmtDay(m[3] ? +m[3] : (+m[2] >= 7 ? 2026 : 2027), +m[2], +m[1]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return fmtDay(+m[3], +m[2], +m[1]);
  return null;
}
const fmtDay = (y, mo, d) => { const v = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return isDay(v) ? v : null; };
const parseTime = v => {
  const m = /^(\d{1,2})(?:[:.h](\d{2}))?h?$/.exec(String(v).trim());
  if (!m || +m[1] > 24 || +(m[2] || 0) > 59) return null;
  return `${String(+m[1] % 24).padStart(2, '0')}:${m[2] || '00'}`;
};
const parseNum = v => { const n = Number(String(v).trim().replace(',', '.').replace(/\s*h$/i, '')); return Number.isFinite(n) ? n : null; };

export function parseSlotsCsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV nema redaka s terminima.');
  const sep = [';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const head = splitCsvLine(lines[0], sep).map(fold);
  const rows = lines.slice(1).map(l => splitCsvLine(l, sep));
  const find = (...names) => head.findIndex(h => names.some(n => h === n || (n.length > 2 && h.startsWith(n))));
  // date column: "Datum" by name, otherwise the first column whose values are dates
  let iDate = find('datum', 'date');
  if (iDate < 0) iDate = head.findIndex((_, i) => rows.every(r => parseDate(r[i] || '')));
  const iBlock = find('blok', 'block', 'smjena', 'termin');
  const iFrom = find('od', 'pocetak', 'start', 'from');
  const iTo = find('do', 'kraj', 'end', 'to');
  const iTime = find('vrijeme', 'time');
  const iHours = find('sati', 'hours', 'trajanje', 'h');
  const iCap = find('mjesta', 'kapacitet', 'broj osoba', 'osoba', 'capacity');
  const iNote = find('tip dana', 'tip', 'vrsta dana', 'napomena');
  const iEvent = find('dogadaj', 'program');
  if (iDate < 0) throw new Error('Nema stupca s datumom (npr. "Datum").');
  if (iCap < 0) throw new Error('Nema stupca s brojem mjesta (npr. "Mjesta").');

  const slots = [], errors = [];
  rows.forEach((r, n) => {
    const at = `Redak ${n + 2}`;
    const day = parseDate(r[iDate] || '');
    if (!day) return errors.push(`${at}: neispravan datum "${r[iDate] || ''}"`);
    let start = iFrom >= 0 ? parseTime(r[iFrom] || '') : null, end = iTo >= 0 ? parseTime(r[iTo] || '') : null;
    if (!start || !end) {   // "Vrijeme" column, or any cell like "09:00–16:00"
      const cell = iTime >= 0 ? r[iTime] : r.find(c => /^\d{1,2}[:.]\d{2}\s*[–—\-]\s*\d{1,2}[:.]\d{2}$/.test(c));
      const m = String(cell || '').split(/\s*[–—\-]\s*/);
      if (m.length === 2) { start = parseTime(m[0]); end = parseTime(m[1]); }
    }
    let block = iBlock >= 0 ? (String(r[iBlock] || '').toUpperCase().match(/\b([AB])\b/) || [])[1] : null;
    if (!block && start) block = toMin(start) < 12 * 60 ? 'A' : 'B';
    if (!start || !end) {
      if (block === 'A') { start = '09:00'; end = '16:00'; }
      else if (block === 'B') { start = '16:00'; end = '00:00'; }
    }
    if (!block || !start || !end) return errors.push(`${at}: nedostaje blok ili vrijeme`);
    const cap = parseNum(r[iCap] || '');
    if (cap === null || cap < 0 || cap > 50 || !Number.isInteger(cap)) return errors.push(`${at}: neispravan broj mjesta "${r[iCap] || ''}"`);
    const h = iHours >= 0 && String(r[iHours] || '').trim() ? parseNum(r[iHours]) : hoursBetween(start, end);
    if (h === null || h <= 0 || h > 24) return errors.push(`${at}: neispravan broj sati "${r[iHours] || ''}"`);
    const note = iNote >= 0 ? String(r[iNote] || '').trim().slice(0, 40) : '';
    const ev = iEvent >= 0 ? String(r[iEvent] || '').trim().replace(/^[—–-]$/, '').slice(0, 200) : '';
    slots.push(makeSlot(day, block, start, end, cap, h, /^obi[cč]an$/i.test(note) ? '' : note, ev));
  });
  const seen = new Set();
  for (const s of slots) { if (seen.has(s.id)) errors.push(`Termin ${s.day} ${s.block} se ponavlja`); seen.add(s.id); }
  if (errors.length) throw new Error(errors.slice(0, 8).join('\n') + (errors.length > 8 ? `\n… još ${errors.length - 8}` : ''));
  if (!slots.length) throw new Error('CSV nema termina.');
  return slots.sort((a, b) => a.id.localeCompare(b.id));
}

// ---- a person's choice ----
// existing: the person's shifts already booked [{day, hours}], chosen: the new shifts [{id, day, hours}].
// Returns null or {error, day|week, hours}.
// existing/chosen: [{id, day, block, hours}]; kind: student | ucenik | drugo
export function checkChoice(existing, chosen, kind = 'student', maxWeek = MAX_WEEK_HOURS) {
  if (kind === 'ucenik') {
    const early = chosen.find(s => s.day < PUPIL_FROM);
    if (early) return { error: 'pupil_dates', day: early.day, slot: early.id };
  }
  const days = new Set(existing.map(s => s.day));
  for (const s of chosen) {
    if (days.has(s.day)) return { error: 'one_per_day', day: s.day, slot: s.id };
    days.add(s.day);
  }
  // at least 12 hours of rest between shifts: after an evening shift (until 00:00 or 03:00) no morning shift the next day
  const all = [...existing, ...chosen], isNew = new Set(chosen.map(s => s.id));
  for (const b of all.filter(s => s.block === 'B')) {
    const a = all.find(s => s.block === 'A' && s.day === addDays(b.day, 1));
    if (a && (isNew.has(a.id) || isNew.has(b.id))) return { error: 'rest', day: a.day, slot: isNew.has(a.id) ? a.id : b.id };
  }
  const weeks = {};
  for (const s of [...existing, ...chosen]) { const w = isoWeek(s.day); weeks[w] = (weeks[w] || 0) + s.hours; }
  for (const [w, h] of Object.entries(weeks)) {
    if (h > maxWeek + 1e-9 && chosen.some(s => isoWeek(s.day) === w)) return { error: 'week_hours', week: w, hours: h };
  }
  return null;
}

// Hours of one shift for the payroll: regular and +50 % (22–06, Sundays, holidays), split by calendar year,
// because the services settle December and January separately. → {2026: {reg, plus}, 2027: {...}}
export function payHours(s) {
  const out = {}, start = slotStartMs(s), end = start + s.hours * 3600e3, step = 15 * 60e3;
  for (let t = start; t < end; t += step) {
    const local = new Date(t + 3600e3);                       // winter time in Croatia: UTC+1
    const day = local.toISOString().slice(0, 10), h = local.getUTCHours();
    const plus = h >= 22 || h < 6 || local.getUTCDay() === 0 || HOLIDAYS.includes(day);
    const y = out[day.slice(0, 4)] ||= { reg: 0, plus: 0 };
    y[plus ? 'plus' : 'reg'] += 0.25;
  }
  return out;
}

export function weekHours(list) {
  const weeks = {};
  for (const s of list) { const w = isoWeek(s.day); weeks[w] = Math.round(((weeks[w] || 0) + s.hours) * 10) / 10; }
  return weeks;
}
