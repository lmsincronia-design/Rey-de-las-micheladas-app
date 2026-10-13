import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LOCALES_REY} from '../src/locales-rey.js';
import {safeMenuUrl} from '../src/domain.js';

const sql=readFileSync(new URL('../supabase/migrations/202610120001_locales_reales.sql',import.meta.url),'utf8');

test('el catálogo trae los 33 locales de la carta oficial, sin duplicados', () => {
  assert.equal(LOCALES_REY.length,33);
  assert.equal(new Set(LOCALES_REY.map(l=>l.id)).size,33);
  assert.equal(new Set(LOCALES_REY.map(l=>l.name)).size,33);
  for(const l of LOCALES_REY){
    assert.match(l.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(l.name.length>=3&&l.address.length>=3&&l.commune.length>=2,l.name);
    assert.ok(safeMenuUrl(l.menu_url),'menu_url HTTPS: '+l.name);
    assert.equal(l.latitude,null,'no se inventan coordenadas: '+l.name);
  }
});

test('la migración SQL carga exactamente los mismos locales que el catálogo', () => {
  const ids=[...sql.matchAll(/\('([0-9a-f-]{36})'::uuid,/g)].map(m=>m[1]);
  assert.deepEqual(ids,LOCALES_REY.map(l=>l.id));
  for(const l of LOCALES_REY)assert.ok(sql.includes(`'${l.name.replace(/'/g,"''")}','${l.address.replace(/'/g,"''")}','${l.commune}'`),'SQL desalineado: '+l.name);
  assert.match(sql,/on conflict\(id\) do update set name=excluded\.name,address=excluded\.address,commune=excluded\.commune;/);
});

test('las comunas coinciden con las de la carta (filtro del selector)', () => {
  const comunas=[...new Set(LOCALES_REY.map(l=>l.commune))].sort();
  assert.ok(comunas.includes('Providencia')&&comunas.includes('Ñuñoa')&&comunas.includes('Puente Alto'));
  assert.ok(comunas.length>=10);
});
