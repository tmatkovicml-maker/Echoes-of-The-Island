import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMenuCsv, priceOrder, businessDay, validItem } from '../src/orders.js';

const menu = parseMenuCsv(readFileSync(new URL('../Jelovnik.csv', import.meta.url), 'utf8'));

test('Jelovnik.csv: 14 items, prices, alcohol, undecided items hidden', () => {
  assert.equal(menu.length, 14);
  const by = id => menu.find(m => m.id === id);
  assert.deepEqual([by('H01').name, by('H01').price, by('H01').available, by('H01').alcohol], ['Kozice u češnjaku', 11, 1, 0]);
  assert.equal(by('P03').price, 4.6);
  assert.deepEqual(menu.filter(m => m.alcohol).map(m => m.id), ['P01', 'P02', 'P03', 'P08']);
  assert.deepEqual(menu.filter(m => !m.available).map(m => m.id), ['H05', 'S01']);
});

test('prices come from the menu; quantities are merged and limited', () => {
  const p = priceOrder([{ id: 'H01', qty: 2 }, { id: 'p01', qty: 1 }, { id: 'H01', qty: 1, price: 0.01 }], menu);
  assert.deepEqual(p.items.map(i => [i.id, i.qty, i.price]), [['H01', 3, 11], ['P01', 1, 2.7]]);
  assert.equal(p.total, 35.7);
  assert.equal(p.alcohol, true);
  assert.equal(priceOrder([{ id: 'H05', qty: 1 }], menu).error, 'unavailable');
  assert.equal(priceOrder([{ id: 'XX', qty: 1 }], menu).error, 'unavailable');
  assert.equal(priceOrder([{ id: 'H01', qty: 0 }], menu).error, 'qty');
  assert.equal(priceOrder([{ id: 'H01', qty: 11 }], menu).error, 'qty');
  assert.equal(priceOrder([], menu).error, 'empty');
});

test('business day changes at 06:00 Zagreb time', () => {
  assert.equal(businessDay(Date.parse('2026-12-31T23:30:00+01:00')), '2026-12-31');
  assert.equal(businessDay(Date.parse('2027-01-01T02:30:00+01:00')), '2026-12-31');
  assert.equal(businessDay(Date.parse('2027-01-01T06:30:00+01:00')), '2027-01-01');
});

test('menu item validation', () => {
  assert.equal(validItem({ id: 'a1', name: 'Fritule', price: '3,5' }).price, 3.5);
  assert.equal(validItem({ id: 'a 1', name: 'X', price: 1 }), null);
  assert.equal(validItem({ id: 'A1', name: '', price: 1 }), null);
  assert.equal(validItem({ id: 'A1', name: 'X', price: -1 }), null);
});
