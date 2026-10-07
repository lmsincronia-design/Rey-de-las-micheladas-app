// Restaurar la demostración: borra socios, boletas, canjes y alertas y deja todo como el primer día
// (locales de ejemplo con PIN de demostración, reglas y códigos de prueba originales). Solo existe en modo demostración.
import { error, json, leerJSON, auditar } from './lib/http.js';
import { exigirAdmin } from './admin.js';
import { sembrarDemo } from './seed.js';

export const CODIGOS_PRUEBA_BASE = [
  ['MESA5K', 150000, 5, 'Mesa de 5 amigos: cuenta de $150.000, $30.000 cada uno'],
  ['PAREJA', 60000, 2, 'Una pareja: $30.000 cada uno'],
  ['SUMA10', 10000, 1, 'Una persona sola, consumo chico'],
  ['RANGO1', 50000, 1, 'Suma $50.000: sube a Comerciante'],
  ['RANGO2', 100000, 1, 'Suma $100.000: sube a Guardia (con RANGO1)'],
  ['RANGO3', 200000, 1, 'Suma $200.000: sube a Noble (con RANGO1 y RANGO2)'],
  ['RANGO4', 350000, 1, 'Suma $350.000: sube a Rey (con los tres anteriores)'],
];

/** Orden pensado para respetar las llaves foráneas. */
const TABLAS_A_VACIAR = ['partes', 'movimientos', 'fichas', 'mesas', 'boletas', 'alertas', 'otps', 'usuarios', 'personal', 'auditoria', 'rate_limits', 'config', 'codigos_prueba', 'locales'];

export async function restaurarDemo(ctx) {
  await exigirAdmin(ctx);
  if (!ctx.demo && !ctx.mvp) {
    throw error(403, 'solo_demostracion', 'Restaurar solo existe en modo demostración (MODO_DEMO o MODO_MVP). En producción no se puede borrar la base.');
  }
  const body = await leerJSON(ctx.req, 2_000);
  if (body.confirmar !== 'RESTAURAR') throw error(400, 'falta_confirmacion', 'Escribe RESTAURAR para confirmar.');

  const antes = {
    socios: (await ctx.db.get('SELECT COUNT(*) AS n FROM usuarios')).n,
    boletas: (await ctx.db.get('SELECT COUNT(*) AS n FROM boletas')).n,
  };
  await ctx.db.batch([
    ...TABLAS_A_VACIAR.map((t) => [`DELETE FROM ${t}`, []]),
    ["DELETE FROM sesiones WHERE tipo != 'admin'", []],
    ...CODIGOS_PRUEBA_BASE.map(([codigo, monto, personas, nota]) => [
      'INSERT INTO codigos_prueba (codigo, monto, personas, nota, activo, creado_en) VALUES (?, ?, ?, ?, 1, ?)',
      [codigo, monto, personas, nota, ctx.ahora],
    ]),
  ]);
  const sembrado = await sembrarDemo(ctx.db, ctx.secreto, ctx.ahora);
  await auditar(ctx.db, 'admin', 'restaurar_demo', antes, ctx.ahora);
  return json({
    ok: true,
    borrados: antes,
    locales: sembrado ? Object.keys(sembrado.llaves) : [],
    pin: sembrado?.pin ?? null,
    mensaje: 'Demostración restaurada: sin socios ni boletas, con las reglas y los códigos de prueba originales.',
  });
}
