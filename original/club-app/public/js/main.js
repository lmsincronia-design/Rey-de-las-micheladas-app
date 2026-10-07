// Enrutador de la aplicación (sin recargar la página).
import { limpiarTemporizadores, esc } from './util.js';
import * as C from './cliente.js';

const app = document.getElementById('app');

async function pintarRuta() {
  limpiarTemporizadores();
  document.querySelectorAll('.modal-fondo, #confeti').forEach((e) => e.remove());
  const ruta = location.pathname.replace(/\/+$/, '') || '/';
  try {
    if (ruta === '/caja') return await (await import('./caja.js')).pagCaja();
    if (ruta === '/admin') return await (await import('./admin.js')).pagAdmin();
    let m;
    if (ruta === '/') return await C.pagInicio();
    if (ruta === '/entrar') return await C.pagEntrar();
    if (ruta === '/boleta') return await C.pagBoleta();
    if (ruta === '/codigo') return await C.pagCodigo();
    if (ruta === '/canjear') return await C.pagCanjear();
    if (ruta === '/rangos') return await C.pagRangos();
    if (ruta === '/historial') return await C.pagHistorial();
    if (ruta === '/perfil') return await C.pagPerfil();
    if (ruta === '/terminos') return C.pagTerminos();
    if ((m = /^\/m\/([A-Za-z0-9_-]{4,60})$/.exec(ruta))) return await C.pagMesa(m[1]);
    app.className = '';
    app.innerHTML = `<div class="hero"><h1>No encontramos esa página</h1><p class="muted">Revisa el enlace o vuelve al inicio.</p></div><a data-l class="btn" href="/">Ir al inicio</a>`;
  } catch (e) {
    app.className = '';
    app.innerHTML = `<div class="hero"><h1>Ups</h1><p class="muted">${esc(e.message || 'Algo salió mal.')}</p></div><button class="btn" id="reintentar">Reintentar</button>`;
    document.getElementById('reintentar').addEventListener('click', pintarRuta);
  }
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-l]');
  if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  history.pushState(null, '', a.getAttribute('href'));
  pintarRuta();
});
addEventListener('popstate', pintarRuta);
addEventListener('cambioruta', pintarRuta);
pintarRuta();
