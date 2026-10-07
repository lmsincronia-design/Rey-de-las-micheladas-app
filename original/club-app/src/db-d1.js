// Adaptador para Cloudflare D1. Misma interfaz que db-node.js.
export function crearDbD1(d1) {
  const preparar = (sql, params = []) =>
    d1.prepare(sql).bind(...params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)));
  const meta = (r) => ({ changes: r.meta?.changes ?? 0, lastRowId: r.meta?.last_row_id ?? 0 });

  return {
    kind: 'd1',
    async run(sql, params) {
      return meta(await preparar(sql, params).run());
    },
    async get(sql, params) {
      return (await preparar(sql, params).first()) ?? null;
    },
    async all(sql, params) {
      const r = await preparar(sql, params).all();
      return r.results ?? [];
    },
    /** D1 ejecuta el batch como una transacción: si una sentencia falla, se revierte todo. */
    async batch(sentencias) {
      const rs = await d1.batch(sentencias.map(([sql, params]) => preparar(sql, params)));
      return rs.map(meta);
    },
  };
}
