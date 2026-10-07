// Adaptador de base de datos para Node (node:sqlite). Se usa en desarrollo local y en las pruebas.
// Expone la misma interfaz asíncrona que el adaptador de Cloudflare D1.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const normalizar = (params = []) =>
  params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

export function crearDbNode(ruta = ':memory:') {
  const sqlite = new DatabaseSync(ruta);
  sqlite.exec('PRAGMA foreign_keys = ON;');
  if (ruta !== ':memory:') sqlite.exec('PRAGMA journal_mode = WAL;');

  const correr = (sql, params) => {
    const r = sqlite.prepare(sql).run(...normalizar(params));
    return { changes: Number(r.changes), lastRowId: Number(r.lastInsertRowid) };
  };

  return {
    kind: 'node',
    raw: sqlite,
    async exec(sql) {
      sqlite.exec(sql);
    },
    async run(sql, params) {
      return correr(sql, params);
    },
    async get(sql, params) {
      return sqlite.prepare(sql).get(...normalizar(params)) ?? null;
    },
    async all(sql, params) {
      return sqlite.prepare(sql).all(...normalizar(params));
    },
    /** Todo o nada, igual que db.batch() de D1. */
    async batch(sentencias) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const salida = sentencias.map(([sql, params]) => correr(sql, params));
        sqlite.exec('COMMIT');
        return salida;
      } catch (e) {
        try {
          sqlite.exec('ROLLBACK');
        } catch {
          /* ya revertido */
        }
        throw e;
      }
    },
    close() {
      sqlite.close();
    },
  };
}

/** Aplica los archivos de /migrations en orden (solo para Node; en Cloudflare se usan las migraciones de wrangler). */
export async function migrar(db) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  await db.exec('CREATE TABLE IF NOT EXISTS _migraciones (nombre TEXT PRIMARY KEY)');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (await db.get('SELECT 1 AS x FROM _migraciones WHERE nombre = ?', [f])) continue;
    await db.exec(readFileSync(join(dir, f), 'utf8'));
    await db.run('INSERT INTO _migraciones (nombre) VALUES (?)', [f]);
  }
}
