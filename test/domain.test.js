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

test('rank progress uses the current tier interval and caps Rey at 100%',async()=>{
 const {rankProgress}=await import('../src/ranks.js');
 assert.equal(rankProgress(0).tier.name,'Plebeyo');assert.equal(rankProgress(25000).percent,50);
 const merchant=rankProgress(60000);assert.equal(merchant.tier.name,'Comerciante');assert.equal(merchant.percent,10);assert.equal(merchant.remaining,90000);
 assert.equal(rankProgress(150000).tier.name,'Guardia Real');assert.equal(rankProgress(150000).percent,0);
 assert.equal(rankProgress(700000).percent,100);assert.equal(rankProgress(900000).next,undefined);
});

test('los enlaces compartidos nunca apuntan a localhost ni a la red local',async()=>{
  const {publicOrigin,PRODUCTION_URL}=await import('../src/domain.js');
  const at=(hostname,origin=`https://${hostname}`)=>({hostname,origin});
  assert.equal(publicOrigin(at('localhost','http://localhost:5173'),undefined),PRODUCTION_URL);
  assert.equal(publicOrigin(at('127.0.0.1','http://127.0.0.1:4175'),undefined),PRODUCTION_URL);
  assert.equal(publicOrigin(at('192.168.1.40','http://192.168.1.40:5173'),undefined),PRODUCTION_URL);
  assert.equal(publicOrigin(at('10.0.0.5','http://10.0.0.5:5173'),undefined),PRODUCTION_URL);
  assert.equal(publicOrigin(at('localhost','http://localhost:5173'),'https://club.example.cl/'),'https://club.example.cl');
  assert.equal(publicOrigin(at('localhost','http://localhost:5173'),'http://evil.test'),PRODUCTION_URL,'solo HTTPS');
  assert.equal(publicOrigin(at('rey-de-las-micheladas-app.vercel.app'),undefined),'https://rey-de-las-micheladas-app.vercel.app');
  assert.equal(publicOrigin(at('club.example.cl'),'https://otro.test'),'https://club.example.cl','en un dominio público manda el dominio real');
});
