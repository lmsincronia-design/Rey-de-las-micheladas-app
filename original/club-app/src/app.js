// Enrutador de la API. Lo usan por igual el Worker de Cloudflare y el servidor de desarrollo/pruebas.
import { ApiError, json, leerCookies } from './lib/http.js';
import { cargarConfig } from './lib/config.js';
import * as auth from './auth.js';
import * as cliente from './cliente.js';
import * as caja from './caja.js';
import * as admin from './admin.js';
import * as socios from './socios.js';
import * as demo from './demo.js';

const RUTAS = [
  ['GET', '/api/estado', async (ctx) => json({ ok: true, demo: ctx.demo, mvp: ctx.mvp, ahora: ctx.ahora })],
  ['GET', '/api/demo/codigos', cliente.codigosDePrueba],
  ['GET', '/api/rangos', async (ctx) => json({
    rangos: ctx.cfg.rangos.map((r) => ({ id: r.id, nombre: r.nombre, desde: r.desde, pct: r.pct, beneficio: r.beneficio })),
    reglas: {
      tope_coronas_por_persona: ctx.cfg.tope_coronas_por_persona,
      horas_activacion: ctx.cfg.horas_activacion,
      ventana_reclamo_horas: ctx.cfg.ventana_reclamo_horas,
      ventana_mesa_horas: ctx.cfg.ventana_mesa_horas,
      canje_minimo: ctx.cfg.canje_minimo,
      meses_inactividad_vence: ctx.cfg.meses_inactividad_vence,
      edad_minima: ctx.cfg.edad_minima,
      regalo: ctx.cfg.regalo.activo ? ctx.cfg.regalo.descripcion : null,
    },
    mvp: ctx.mvp,
    terminos_version: ctx.cfg.terminos_version,
  })],

  ['POST', '/api/auth/codigo', auth.solicitarCodigo],
  ['POST', '/api/auth/verificar', auth.verificarCodigo],
  ['POST', '/api/auth/registro', auth.registrar],
  ['POST', '/api/auth/salir', auth.salir],

  ['GET', '/api/me', cliente.miPerfil],
  ['GET', '/api/me/movimientos', cliente.misMovimientos],
  ['GET', '/api/me/fichas', cliente.historialFichas],
  ['GET', '/api/me/datos', cliente.exportarMisDatos],
  ['POST', '/api/me/eliminar', cliente.eliminarCuenta],
  ['POST', '/api/me/salon', cliente.configurarSalon],
  ['GET', '/api/salon', cliente.salonDelRey],

  ['POST', '/api/boletas/reclamar', cliente.reclamarBoleta],
  ['GET', '/api/mesas/:token', cliente.verMesa],
  ['POST', '/api/mesas/:token/reclamar', cliente.reclamarMesa],
  ['POST', '/api/canjes', cliente.crearCanje],
  ['POST', '/api/canjes/cancelar', cliente.cancelarCanje],
  ['POST', '/api/canjes/confirmar', cliente.confirmarCanje],
  ['POST', '/api/regalo', cliente.crearRegalo],

  ['GET', '/api/caja/locales', caja.localesPublicos],
  ['POST', '/api/caja/login', caja.loginLocal],
  ['POST', '/api/caja/salir', caja.salirLocal],
  ['GET', '/api/caja/yo', caja.yoLocal],
  ['POST', '/api/caja/boletas', caja.emitirBoleta],
  ['POST', '/api/caja/boletas/anular', caja.anularBoleta],
  ['GET', '/api/caja/boletas', caja.listarBoletas],
  ['GET', '/api/caja/socios', socios.listarSociosCaja],
  ['GET', '/api/caja/socios/:codigo', socios.verSocio],
  ['POST', '/api/caja/socios/:codigo/canje', socios.canjearSocio],
  ['POST', '/api/caja/socios/:codigo/regalo', socios.regaloSocio],
  ['GET', '/api/caja/fichas/:codigo', caja.verFicha],
  ['POST', '/api/caja/fichas/:codigo/aplicar', caja.aplicarFicha],

  ['POST', '/api/admin/login', admin.loginAdmin],
  ['POST', '/api/admin/salir', admin.salirAdmin],
  ['GET', '/api/admin/resumen', admin.resumen],
  ['GET', '/api/admin/alertas', admin.listarAlertas],
  ['POST', '/api/admin/alertas/:id/resolver', admin.resolverAlerta],
  ['GET', '/api/admin/socios', admin.listarSocios],
  ['GET', '/api/admin/socios.csv', admin.exportarSociosCSV],
  ['GET', '/api/admin/socios/:id', admin.verSocio],
  ['POST', '/api/admin/socios/:id/ajuste', admin.ajustarSaldo],
  ['POST', '/api/admin/socios/:id/estado', admin.cambiarEstadoSocio],
  ['POST', '/api/admin/socios/:id/personal', admin.marcarPersonal],
  ['POST', '/api/admin/personal', admin.agregarPersonal],
  ['GET', '/api/admin/boletas', admin.listarBoletasAdmin],
  ['GET', '/api/admin/locales', admin.listarLocales],
  ['POST', '/api/admin/locales', admin.nuevoLocal],
  ['POST', '/api/admin/locales/ejemplo', admin.localesEjemplo],
  ['POST', '/api/admin/locales/:id', admin.editarLocal],
  ['POST', '/api/admin/locales/:id/pin', admin.cambiarPin],
  ['POST', '/api/admin/locales/:id/apikey', admin.regenerarApiKey],
  ['GET', '/api/admin/config', admin.verConfig],
  ['POST', '/api/admin/config', admin.guardarConfigAdmin],
  ['GET', '/api/admin/codigos', admin.listarCodigosPrueba],
  ['POST', '/api/admin/codigos', admin.guardarCodigoPrueba],
  ['POST', '/api/admin/codigos/borrar', admin.borrarCodigoPrueba],
  ['POST', '/api/admin/restaurar', demo.restaurarDemo],
  ['GET', '/api/admin/auditoria', admin.verAuditoria],
  ['POST', '/api/admin/importar', admin.importarCSV],
].map(([metodo, patron, fn]) => {
  const nombres = [];
  const re = new RegExp('^' + patron.replace(/:([a-z]+)/g, (_, n) => (nombres.push(n), '([^/]+)')) + '/?$');
  return { metodo, re, nombres, fn };
});

function resolver(metodo, ruta) {
  let rutaExiste = false;
  for (const r of RUTAS) {
    const m = r.re.exec(ruta);
    if (!m) continue;
    rutaExiste = true;
    if (r.metodo !== metodo) continue;
    const params = {};
    r.nombres.forEach((n, i) => {
      try {
        params[n] = decodeURIComponent(m[i + 1]);
      } catch {
        params[n] = m[i + 1];
      }
    });
    return { fn: r.fn, params };
  }
  return { fn: null, rutaExiste };
}

/**
 * crearApp({ db, env, reloj }) -> { fetch(request) }
 * `reloj` permite fijar la hora en las pruebas.
 */
export function crearApp({ db, env = {}, reloj = () => Date.now() }) {
  const activo = (v) => ['1', 'true', 'si'].includes(String(v ?? '').toLowerCase());
  const demo = activo(env.MODO_DEMO);
  const mvp = activo(env.MODO_MVP);
  return {
    async fetch(req) {
      const url = new URL(req.url);
      try {
        if (!url.pathname.startsWith('/api/')) return json({ error: { codigo: 'no_encontrado', mensaje: 'No existe.' } }, 404);
        const { fn, params, rutaExiste } = resolver(req.method, url.pathname);
        if (!fn) {
          return rutaExiste
            ? json({ error: { codigo: 'metodo_no_permitido', mensaje: 'Método no permitido.' } }, 405)
            : json({ error: { codigo: 'no_encontrado', mensaje: 'No existe.' } }, 404);
        }
        // Defensa extra contra CSRF: una escritura desde otro sitio se rechaza (las cajas usan llave, sin cookies).
        if (req.method !== 'GET') {
          const origen = req.headers.get('origin');
          const conLlave = /^Bearer\s/i.test(req.headers.get('authorization') || '');
          if (origen && !conLlave) {
            let host = '';
            try {
              host = new URL(origen).host;
            } catch { /* origen inválido */ }
            if (host !== url.host) return json({ error: { codigo: 'origen_invalido', mensaje: 'Solicitud no permitida.' } }, 403);
          }
        }
        const secreto = env.SECRET || (demo ? 'secreto-de-desarrollo-cambiar' : '');
        if (!secreto) return json({ error: { codigo: 'falta_secreto', mensaje: 'El servidor no está configurado (SECRET).' } }, 500);
        const ctx = {
          req,
          url,
          db,
          env,
          demo,
          mvp,
          secreto,
          params,
          ahora: reloj(),
          cookies: leerCookies(req),
          ip: req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local',
          seguro: url.protocol === 'https:',
        };
        ctx.cfg = await cargarConfig(db, mvp);
        return await fn(ctx);
      } catch (e) {
        if (e instanceof ApiError) {
          return json({ error: { ...e.extra, codigo: e.codigo, mensaje: e.message } }, e.estado);
        }
        console.error('Error interno:', e);
        return json({ error: { codigo: 'error_interno', mensaje: 'Algo salió mal de nuestro lado. Intenta de nuevo.' } }, 500);
      }
    },
  };
}
