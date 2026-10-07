// Punto de entrada en Cloudflare Workers. La API vive en /api/*; el resto lo sirven los archivos estáticos de /public.
import { crearApp } from './app.js';
import { crearDbD1 } from './db-d1.js';
import { limpiar } from './admin.js';
import { metaMesa, aplicarOG, TOKEN_EN_RUTA } from './lib/og.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (!env.ASSETS) return new Response('No encontrado', { status: 404 });
      const resp = await env.ASSETS.fetch(request);
      if (!(resp.headers.get('content-type') || '').includes('text/html')) return resp;
      let meta = null;
      const tok = TOKEN_EN_RUTA.exec(url.pathname);
      if (tok) {
        try {
          meta = await metaMesa(crearDbD1(env.DB), decodeURIComponent(tok[1]));
        } catch { /* sin vista previa personalizada */ }
      }
      const cab = new Headers(resp.headers);
      cab.delete('content-length');
      cab.delete('etag');
      cab.set('cache-control', 'no-cache');
      return new Response(aplicarOG(await resp.text(), url.origin, meta), { status: resp.status, headers: cab });
    }
    return crearApp({ db: crearDbD1(env.DB), env }).fetch(request);
  },
  // Limpieza diaria (sesiones, códigos y contadores vencidos). Se activa con "triggers" en wrangler.jsonc.
  async scheduled(_evento, env) {
    await limpiar(crearDbD1(env.DB), Date.now());
  },
};
