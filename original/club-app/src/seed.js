// Datos de demostración: algunos locales reales del Rey con PIN y llave de API conocidos (solo para desarrollo).
import { sha256, hmac } from './lib/util.js';
import { LOCALES_EJEMPLO } from './admin.js';

export async function sembrarDemo(db, secreto, ahora = Date.now(), { pin = '1234', codigos = ['REY-I', 'REY-III', 'REY-IV', 'REY-X', 'REY-XI', 'REY-XIII'] } = {}) {
  const hay = await db.get('SELECT COUNT(*) AS n FROM locales');
  if (hay.n > 0) return null;
  const llaves = {};
  for (const [codigo, nombre, direccion] of LOCALES_EJEMPLO.filter((l) => codigos.includes(l[0]))) {
    const apiKey = `rey_demo_${codigo.toLowerCase()}`;
    const r = await db.run(
      'INSERT INTO locales (codigo, nombre, direccion, pin_hash, api_key_hash, activo, creado_en) VALUES (?, ?, ?, NULL, ?, 1, ?)',
      [codigo, nombre, direccion, await sha256(apiKey), ahora],
    );
    await db.run('UPDATE locales SET pin_hash = ? WHERE id = ?', [await hmac(secreto, `pin:${r.lastRowId}:${pin}`), r.lastRowId]);
    llaves[codigo] = apiKey;
  }
  return { pin, llaves };
}
