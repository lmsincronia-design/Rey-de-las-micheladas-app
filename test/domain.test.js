import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validRut,normalizePhone,adultBirthday,safeMenuUrl,distanceKm,esc} from '../src/domain.js';
test('validates Chilean RUT checksum rather than accepting a formatted string',()=>{
 assert.equal(validRut('12.345.678-5'),true);assert.equal(validRut('12.345.678-9'),false);assert.equal(validRut('abc'),false);
});
test('validates age boundary and invalid calendar dates',()=>{
 const now=new Date('2026-10-07T12:00:00');assert.equal(adultBirthday('2008-10-07',now),true);assert.equal(adultBirthday('2008-10-08',now),false);assert.equal(adultBirthday('2000-02-31',now),false);
});
test('normalizes local mobile numbers',()=>{assert.equal(normalizePhone('9 1234 5678'),'+56912345678');assert.equal(normalizePhone('+56 9 1234 5678'),'+56912345678');});
test('menu URLs cannot execute scripts or embed credentials',()=>{assert.equal(safeMenuUrl('javascript:alert(1)'),null);assert.equal(safeMenuUrl('https://user:password@example.com'),null);assert.equal(safeMenuUrl('https://qrfy.io/p/oOBx-dlqTy'),'https://qrfy.io/p/oOBx-dlqTy');});
test('location sorting handles absent coordinates',()=>{assert.equal(distanceKm({latitude:0,longitude:0},{latitude:0,longitude:0}),0);assert.equal(distanceKm({latitude:0,longitude:0},{}),Infinity);});
test('escapes personal names before inserting HTML',()=>{assert.equal(esc('<img onerror="alert(1)">'),'&lt;img onerror=&quot;alert(1)&quot;&gt;');});
