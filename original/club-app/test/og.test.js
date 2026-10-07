import test from 'node:test';
import assert from 'node:assert/strict';
import { montar, registrarSocio, boletaNueva } from './helpers.js';
import { metaMesa, aplicarOG, TOKEN_EN_RUTA } from '../src/lib/og.js';

test('el enlace de una mesa tiene vista previa con el nombre de quien pagó (sin apellido ni teléfono)', async () => {
  const c = await montar();
  const camila = await registrarSocio(c, { nombre: 'Camila Rojas' });
  const codigo = await boletaNueva(c, { monto: 150000 });
  const r = await camila.nav.post('/api/boletas/reclamar', { codigo, personas: 5 });
  const meta = await metaMesa(c.db, r.data.mesa.token, c.reloj.t);
  assert.match(meta.titulo, /^Camila te guardó/);
  assert.match(meta.descripcion, /\$30\.000/);
  assert.ok(!JSON.stringify(meta).includes('Rojas') && !JSON.stringify(meta).includes(camila.tel));
  assert.equal(await metaMesa(c.db, 'noexiste1234', c.reloj.t), null);
  assert.equal(await metaMesa(c.db, "x'; DROP TABLE mesas;--", c.reloj.t), null);
  const vencida = await metaMesa(c.db, r.data.mesa.token, c.reloj.t + 49 * 3_600_000);
  assert.match(vencida.descripcion, /venció/);
});

test('aplicarOG escribe la URL absoluta de la imagen y escapa el título', () => {
  const html = '<title>X</title><meta property="og:title" content="a"><meta property="og:description" content="b"><meta name="twitter:title" content="a"><meta property="og:image" content="__ORIGEN__/assets/og-club.jpg">';
  const out = aplicarOG(html, 'https://club.ejemplo.cl', { titulo: 'Ana "<b>" te guardó', descripcion: 'Hola & chao' });
  assert.ok(out.includes('https://club.ejemplo.cl/assets/og-club.jpg'));
  assert.ok(!out.includes('<b>'));
  assert.ok(out.includes('&amp;'));
  assert.ok(TOKEN_EN_RUTA.test('/m/abcDEF123') && !TOKEN_EN_RUTA.test('/m/a/b'));
});
