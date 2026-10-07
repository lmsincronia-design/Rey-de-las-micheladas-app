// Pantallas del socio.
import {
  $, $$, esc, fmt, api, toast, copiar, compartirNativo, enlaceWhatsApp, qrSvg, confeti, intervalo, modal,
  cuando, mesAnio, hora, duracion, formatearTelefono, formatearCodigo, soloDigitos,
} from './util.js';
import { medallaSVG, EMOJI_MOV, ico } from './iconos.js';
import { monedaSVG } from './moneda.js';
import { estado, ir } from './nav.js';

const app = document.getElementById('app');
const LOGO = '/assets/logo-rey.jpg';

const limonDeco = (pos, tam = 120) => `<img class="limon-deco ${pos}" src="/assets/limon.svg" width="${tam}" height="${tam}" alt="">`;
function vasoGanadas(r, sub = '') {
  const activa = r.disponibles_desde > Date.now() + 60_000;
  return `<div class="vaso pop"><div class="espuma"></div>${limonDeco('br', 130)}<div class="vaso-in">${monedaSVG(84)}<div class="muted peq" style="margin-top:6px">Sumaste${sub}</div><div class="gran-num">+${fmt(r.coronas_ganadas)}</div><div class="muted">coronas</div>
    <p class="peq" style="margin-top:10px">Como <b>${esc(r.rango_antes)}</b> ganas el <b>${r.pct}%</b> de tu parte (${fmt(r.gasto_sumado)})${r.tope_aplicado ? `, con un máximo de ${fmt(r.tope)} por persona en cada boleta` : ''}.</p>
    <p class="peq" style="margin-top:6px">${activa ? `Se activan <b>${esc(cuando(r.disponibles_desde))}</b>. Tienes que volver para usarlas.` : 'Ya están <b>disponibles</b>: puedes canjearlas ahora mismo.'}</p></div></div>`;
}

// Una fila de jarros: dorado = parte reclamada, anillo = reservada a un amigo, punteado = libre.
function jarrosMesa(m) {
  const lista = [];
  for (let i = 0; i < m.personas; i++) lista.push(i < m.reclamadas ? 'rec' : i < m.reclamadas + m.asignadas ? 'asi' : 'lib');
  return `<div class="jarros" aria-label="${m.reclamadas} de ${m.personas} partes reclamadas">${lista.map((k) => `<span class="jarro ${k}">${ico('jarro')}</span>`).join('')}</div>
    <div class="leyenda peq muted"><span><i class="rec"></i>Reclamada</span>${m.asignadas ? '<span><i class="asi"></i>Guardada para un amigo</span>' : ''}<span><i class="lib"></i>Libre</span></div>`;
}

const textoCompartir = (nombre, local, parte, url) => `${nombre ? nombre + ' te invita: ' : ''}estuvimos en ${local} 🍻 Reclama tu parte de la cuenta (${fmt(parte)}) y suma coronas en el Club del Rey 👑 Tienes 48 horas: ${url}`;

const NOTA_MVP = `<div class="demo-nota">${ico('info')}<div><b>Versión de demostración.</b> En el Club real las coronas se activan 24 horas después de la visita y el código viene impreso en la boleta de caja. Aquí está desactivado para que puedas probarlo todo al instante.</div></div>`;

export async function cargarYo() {
  try {
    estado.me = await api('GET', '/api/me');
  } catch (e) {
    if (e.estado === 401 || e.codigo === 'cuenta_bloqueada') estado.me = null;
    else throw e;
  }
  return estado.me;
}

function pintar(html, { nav = '', clase = '' } = {}) {
  app.className = clase;
  app.innerHTML = html + (nav ? navInferior(nav) : '');
  scrollTo(0, 0);
}

function navInferior(activo) {
  const it = (ruta, em, txt, clase = '') =>
    `<a data-l href="${ruta}" class="${clase} ${activo === ruta ? 'act' : ''}"><span class="em">${ico(em)}</span>${txt}</a>`;
  return `<nav class="nav" aria-label="Menú principal"><div class="nav-in">
    ${it('/', 'casa', 'Inicio')}${it('/canjear', 'ticket', 'Canjear')}${it('/codigo', 'qr', 'Mi código', 'centro')}${it('/rangos', 'trofeo', 'Rangos')}${it('/perfil', 'usuario', 'Perfil')}
  </div></nav>`;
}

function cabecera(titulo, sub = '', atras = false) {
  return `<header class="cabecera">${atras ? '<button class="atras" data-atras aria-label="Volver">‹</button>' : `<img src="${LOGO}" alt="">`}
    <div class="tit"><b>${esc(titulo)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div></header>`;
}

function cargando(txt = 'Cargando…') {
  pintar(`<div class="cargando"><div class="spinner"></div>${esc(txt)}</div>`);
}

function exigirSesion(destino) {
  if (estado.me) return false;
  sessionStorage.setItem('rey_next', destino || location.pathname);
  ir('/entrar', true);
  return true;
}

function enlazarAtras() {
  $('[data-atras]')?.addEventListener('click', () => (history.length > 1 ? history.back() : ir('/')));
}

function tarjetaRango(me) {
  const r = me.rango;
  const sig = r.siguiente;
  return `<div class="socio">${limonDeco('tr', 110)}<div class="marca">${ico('corona')} Club del Rey</div>
    <div class="cuerpo">${medallaSVG(r.id, 92)}
      <div class="info"><div class="nombre">${esc(me.usuario.nombre_pila)} · rango</div><div class="rango">${esc(r.nombre)}</div><div class="desde">Socio desde ${esc(mesAnio(me.usuario.miembro_desde))}</div><a data-l class="cod-chip" href="/codigo">${ico('qr')} ${esc(formatearCodigo(me.usuario.codigo_socio))}</a></div></div>
    <div class="barra"><i style="width:${Math.round(r.progreso * 100)}%"></i></div>
    <span class="peq muted">${sig ? `Te faltan <b style="color:var(--y2)">${fmt(sig.falta)}</b> de consumo para ser ${esc(sig.nombre)}` : 'Llegaste a lo más alto. ¡Larga vida al Rey!'}</span></div>`;
}

/* ───────────────────────── Inicio ───────────────────────── */

export async function pagInicio() {
  cargando();
  const me = await cargarYo();
  if (!me) return pagLanding();
  const [movs] = await Promise.all([api('GET', '/api/me/movimientos?limite=4')]);
  const s = me.saldo;
  const ahora = me.ahora;
  const vigentes = me.mesas.filter((m) => m.vigente && m.libres + m.asignadas > 0);
  const html = `
    <header class="cabecera"><img src="${LOGO}" alt=""><div class="tit"><b>Hola, ${esc(me.usuario.nombre_pila)}</b><span>Socio desde ${esc(mesAnio(me.usuario.miembro_desde))}</span></div></header>
    ${me.reglas.mvp ? NOTA_MVP : ''}
    ${tarjetaRango(me)}
    <div class="card"><div class="saldo">
      <div class="caja grande"><span class="moneda-lado">${monedaSVG(38)}</span><div><small>Coronas disponibles</small><b>${fmt(s.disponible)}</b></div></div>
      <div class="caja"><small>Por activar</small><b>${fmt(s.por_activar)}</b>${s.por_activar > 0 ? `<div class="nota">Se activan ${esc(cuando(s.proxima_activacion, ahora))}</div>` : '<div class="nota">Nada pendiente</div>'}</div>
    </div></div>
    ${me.ficha_activa ? `<a data-l href="/canjear" class="card amarilla" style="display:block;text-decoration:none"><b>${ico('ticket')} Tienes una ficha activa</b><div class="peq muted">${esc(me.ficha_activa.descripcion || '')} · tócala para mostrarla</div></a>` : ''}
    <div class="acciones">
      <a data-l class="accion principal" href="/codigo"><span class="em">${ico('qr')}</span>Mi código<small>Díctaselo al garzón antes de pagar</small></a>
      <a data-l class="accion" href="/canjear"><span class="em">${ico('ticket')}</span>Canjear<small>Descuento en tu cuenta</small></a>
    </div>
    <a data-l href="/boleta" class="enlace-chico">${ico('recibo')} ¿Pagaste sin dar tu código? Ingresa el código de tu boleta</a>
    ${me.pendientes.map((p) => `<a data-l href="/m/${esc(p.token)}" class="card ok" style="display:block;text-decoration:none"><b>${ico('regalo')} ${esc(p.pagador)} te guardó tu parte</b><div class="peq muted">${esc(p.local)} · +${fmt(p.coronas_estimadas)} coronas · vence ${esc(cuando(p.expira_en, ahora))}</div><span class="btn chico" style="margin-top:10px">Reclamar mi parte</span></a>`).join('')}
    ${me.regalo.disponible ? `<a data-l href="/canjear" class="card amarilla" style="display:block;text-decoration:none"><b>${ico('pastel')} ¡Feliz cumpleaños!</b><div class="peq muted">${esc(me.regalo.descripcion)} te está esperando</div></a>` : ''}
    ${vigentes.length ? `<div class="card"><h3 style="margin-bottom:10px">Tus mesas abiertas</h3><div class="lista">${vigentes.map((m) => `<a data-l href="/m/${esc(m.token)}" class="item" style="text-decoration:none;color:inherit"><span class="em">${ico('grupo')}</span><span class="tx"><b>${esc(m.local)}</b><span>${m.libres + m.asignadas} de ${m.personas - 1} lugares sin reclamar · vence ${esc(cuando(m.expira_en, ahora))}</span></span><span class="btn chico">Compartir</span></a>`).join('')}</div></div>` : ''}
    <div class="card"><div class="fila" style="margin-bottom:10px"><h3>Últimos movimientos</h3><a data-l class="peq" href="/historial" style="text-align:right">Ver todo</a></div>
      ${movs.movimientos.length ? `<div class="lista">${movs.movimientos.map(filaMovimiento).join('')}</div>` : '<p class="muted peq">Aún no tienes movimientos. Registra tu primera boleta y empieza a subir de rango.</p>'}</div>`;
  pintar(html, { nav: '/' });
}

function filaMovimiento(m) {
  const pos = m.coronas >= 0;
  return `<div class="item"><span class="em">${EMOJI_MOV[m.tipo] || '•'}</span><span class="tx"><b>${esc(m.titulo)}</b><span>${esc(m.local || m.nota || '')} · ${esc(cuando(m.creado_en))}${m.activa_desde ? ` · se activa ${esc(cuando(m.activa_desde))}` : ''}</span></span><span class="monto ${pos ? 'pos' : 'neg'}">${pos ? '+' : ''}${fmt(m.coronas)}</span></div>`;
}

/* ───────────────────────── Landing ───────────────────────── */

export async function pagLanding() {
  const r = await api('GET', '/api/rangos');
  pintar(`
    <div class="portada"><img class="foto" src="/assets/foto-camaron.jpg" alt=""><span class="etq">Club de socios</span></div>
    <div class="hero">${limonDeco('h1', 84)}${limonDeco('h2', 70)}<img class="logo" src="${LOGO}" alt="El Rey de las Micheladas"><h1>${ico('corona')} Club del Rey</h1>
    <p>Cada visita te sube de rango. Cada rango te devuelve más coronas.</p></div>
    <div class="franja-foto"><img src="/assets/foto-variedad.jpg" alt="Micheladas del Rey"><span>Micheladas, cerveza y buena onda</span></div>
    <div class="fila-medallas">${r.rangos.map((x) => `<div class="centro">${medallaSVG(x.id, 54)}<div class="peq muted" style="margin-top:4px">${esc(x.nombre)}</div></div>`).join('')}</div>
    <div class="card"><h2 style="margin-bottom:12px">Así funciona</h2><div class="pasos">
      <div class="paso"><div><b>Únete en 30 segundos</b><span>Con tu celular y tu cumpleaños. Sin descargar nada.</span></div></div>
      <div class="paso"><div><b>Antes de pagar, dile tu código al garzón</b><span>Tu código personal está en la app. Él ve tus coronas y las descuenta de la cuenta.</span></div></div>
      <div class="paso"><div><b>Paga y suma coronas</b><span>${r.reglas.horas_activacion > 0 ? `Al emitir la boleta se acreditan a tu código y se activan a las ${r.reglas.horas_activacion} horas.` : 'Al emitir la boleta se acreditan a tu código.'} Subes de rango según lo que consumes.</span></div></div>
    </div></div>
    ${r.reglas.regalo ? `<div class="card amarilla"><b>${ico('pastel')} Tu cumpleaños: ${esc(r.reglas.regalo.toLowerCase())}</b></div>` : ''}
    <a data-l class="btn" href="/entrar">Unirme al Club</a>
    <p class="peq muted centro" style="margin-top:14px">Solo mayores de ${r.reglas.edad_minima} años · Consume responsablemente · <a data-l href="/terminos">Términos</a></p>`);
}

/* ───────────────────────── Entrar / registrarse ───────────────────────── */

export async function pagEntrar() {
  await cargarYo();
  if (estado.me) return ir('/', true);
  let tel = '';
  let registro = null;
  let enviadoEn = 0;

  function irAlDestino() {
    const next = sessionStorage.getItem('rey_next');
    sessionStorage.removeItem('rey_next');
    ir(next && next.startsWith('/') ? next : '/', true);
  }

  function paso1(error = '') {
    pintar(`${cabecera('Entra al Club', 'Con tu celular', true)}
      <div class="card"><h2 style="margin-bottom:6px">Tu número de celular</h2>
      <p class="muted peq" style="margin-bottom:14px">Te mandamos un código por WhatsApp para confirmar que el número es tuyo.</p>
      ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
      <label class="campo"><span>Celular</span><div class="tel-wrap"><div class="pref">+56</div><input id="tel" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="9 1234 5678" value="${esc(tel)}"></div></label>
      <button class="btn" id="enviar">Enviar código</button></div>`);
    enlazarAtras();
    const inp = $('#tel');
    inp.addEventListener('input', () => { inp.value = formatearTelefono(inp.value); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#enviar').click(); });
    inp.focus();
    $('#enviar').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      tel = inp.value;
      if (soloDigitos(tel).length < 9) return paso1('Escribe tu celular completo: 9 dígitos, parte con 9.');
      b.disabled = true;
      b.textContent = 'Enviando…';
      try {
        const r = await api('POST', '/api/auth/codigo', { telefono: tel });
        enviadoEn = Date.now();
        paso2(r.codigo_demo || null);
      } catch (err) {
        paso1(err.message);
      }
    });
  }

  function paso2(demo, error = '') {
    pintar(`${cabecera('Confirma tu número', '+56 ' + tel, true)}
      <div class="card"><h2 style="margin-bottom:6px">Ingresa el código</h2>
      <p class="muted peq" style="margin-bottom:14px">Te llegó un código de 6 dígitos por WhatsApp. Vence en 5 minutos.</p>
      ${demo ? `<div class="aviso"><b>Modo demostración:</b> tu código es <b>${esc(demo)}</b> <button class="btn chico sec" id="usar" style="margin-left:6px">Usarlo</button></div>` : ''}
      ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
      <label class="campo"><span>Código</span><input id="cod" class="codigo-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······"></label>
      <button class="btn" id="verif">Confirmar</button>
      <div class="sep"></div><button class="btn sec" id="reenviar" disabled>Reenviar código</button></div>`);
    enlazarAtras();
    const cod = $('#cod');
    cod.focus();
    const reenviar = $('#reenviar');
    const t = intervalo(() => {
      const falta = 30 - Math.floor((Date.now() - enviadoEn) / 1000);
      reenviar.disabled = falta > 0;
      reenviar.textContent = falta > 0 ? `Reenviar código (${falta})` : 'Reenviar código';
    }, 500);
    const verificar = async () => {
      const c = soloDigitos(cod.value);
      if (c.length !== 6) return;
      $('#verif').disabled = true;
      try {
        const r = await api('POST', '/api/auth/verificar', { telefono: tel, codigo: c });
        if (r.nuevo) {
          registro = r.registro_token;
          paso3();
        } else {
          await cargarYo();
          toast(`¡Hola de nuevo, ${r.usuario.nombre.split(' ')[0]}!`);
          irAlDestino();
        }
      } catch (err) {
        clearInterval(t);
        paso2(demo, err.message);
      }
    };
    cod.addEventListener('input', () => { cod.value = soloDigitos(cod.value).slice(0, 6); if (cod.value.length === 6) verificar(); });
    $('#verif').addEventListener('click', verificar);
    $('#usar')?.addEventListener('click', () => { cod.value = demo; verificar(); });
    reenviar.addEventListener('click', async () => {
      try {
        const r = await api('POST', '/api/auth/codigo', { telefono: tel });
        enviadoEn = Date.now();
        clearInterval(t);
        paso2(r.codigo_demo || null);
        toast('Te enviamos un código nuevo');
      } catch (err) { toast(err.message, 'err'); }
    });
  }

  function paso3(error = '', datos = {}) {
    const hoy = new Date();
    const max = `${hoy.getFullYear() - 18}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    pintar(`${cabecera('Casi listo', 'Cuéntanos de ti')}
      <div class="card"><h2 style="margin-bottom:14px">Crea tu perfil de socio</h2>
      ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
      <label class="campo"><span>Nombre y apellido</span><input id="nombre" type="text" autocomplete="name" maxlength="60" placeholder="Camila Rojas" value="${esc(datos.nombre || '')}"></label>
      <label class="campo"><span>Fecha de cumpleaños</span><input id="nac" type="date" min="1900-01-01" max="${max}" autocomplete="bday" value="${esc(datos.nac || '')}"></label>
      <p class="muted peq" style="margin:-6px 0 14px">Es para regalarte una michelada el día de tu cumple. Solo mayores de 18 años.</p>
      <label class="check"><input type="checkbox" id="acepta"><span>Acepto los <a href="/terminos" target="_blank" rel="noopener">términos del Club</a> y que El Rey de las Micheladas use mis datos para administrar mis coronas y avisarme de mi regalo. Puedo pedir que borren mi cuenta cuando quiera.</span></label>
      <button class="btn" id="crear">Unirme al Club</button></div>`);
    $('#nombre').focus();
    $('#crear').addEventListener('click', async (e) => {
      const nombre = $('#nombre').value.trim();
      const nac = $('#nac').value;
      if (nombre.length < 2) return paso3('Escribe tu nombre.', { nombre, nac });
      if (!nac) return paso3('Elige tu fecha de cumpleaños.', { nombre, nac });
      if (!$('#acepta').checked) return paso3('Para unirte tienes que aceptar los términos.', { nombre, nac });
      e.currentTarget.disabled = true;
      try {
        await api('POST', '/api/auth/registro', { registro_token: registro, nombre, nacimiento: nac, acepta: true });
        await cargarYo();
        confeti();
        toast(`¡Bienvenido al Club, ${nombre.split(' ')[0]}!`);
        irAlDestino();
      } catch (err) {
        if (err.codigo === 'registro_vencido') return paso1('Tu verificación venció. Empecemos de nuevo.');
        paso3(err.message, { nombre, nac });
      }
    });
  }

  paso1();
}

/* ───────────────────────── Mi código ───────────────────────── */

export async function pagCodigo() {
  cargando();
  const me = await cargarYo();
  if (exigirSesion('/codigo')) return;
  const cod = me.usuario.codigo_socio;
  const grande = formatearCodigo(cod);
  const r = me.rango;
  pintar(`${cabecera('Mi código', 'Muéstraselo al garzón antes de pedir la cuenta')}
    <div class="pase pop">${limonDeco('tr', 110)}
      <div class="marca">${ico('corona')} Club del Rey <span>${esc(me.usuario.nombre_pila)}</span></div>
      <div class="pase-cuerpo"><div class="pase-qr">${qrSvg(cod, 150)}</div>
        <div class="pase-datos">${medallaSVG(r.id, 64)}<div class="rango-chico">${esc(r.nombre)} · ${r.pct}%</div></div></div>
      <div class="pase-codigo" aria-label="Tu código ${esc(cod)}">${esc(grande)}</div>
      <div class="pase-saldo"><span class="moneda-lado">${monedaSVG(34)}</span><div><small>Coronas disponibles</small><b id="saldo-cod">${fmt(me.saldo.disponible)}</b></div><div class="pend"><small>Por activar</small><b id="pend-cod">${fmt(me.saldo.por_activar)}</b></div></div>
    </div>
    <div id="aviso-mov"></div>
    <div class="card plano"><h3 style="margin-bottom:8px">Cómo se usa</h3><div class="pasos">
      <div class="paso"><div><b>Antes de pedir la cuenta</b><span>Díctale tu código al garzón o muéstrale esta pantalla.</span></div></div>
      <div class="paso"><div><b>Él ve tus coronas</b><span>Y las descuenta de la cuenta, antes de emitir la boleta.</span></div></div>
      <div class="paso"><div><b>Al pagar, se te acreditan</b><span>Esta pantalla se actualiza sola cuando el garzón registra tu consumo.</span></div></div>
    </div></div>
    <a data-l href="/boleta" class="enlace-chico">${ico('recibo')} ¿Pagaste sin dar tu código? Ingresa el código de tu boleta</a>`, { nav: '/codigo' });

  // Esta pantalla queda abierta frente al garzón: si cambia el saldo, se muestra qué pasó.
  let ultimo = { d: me.saldo.disponible, p: me.saldo.por_activar, g: me.saldo.gasto12m, rango: me.rango.id };
  intervalo(async () => {
    const m = await cargarYo();
    if (!m) return;
    const cambio = m.saldo.disponible !== ultimo.d || m.saldo.por_activar !== ultimo.p || m.saldo.gasto12m !== ultimo.g;
    if (!cambio) return;
    const antes = ultimo;
    ultimo = { d: m.saldo.disponible, p: m.saldo.por_activar, g: m.saldo.gasto12m, rango: m.rango.id };
    $('#saldo-cod').textContent = fmt(m.saldo.disponible);
    $('#pend-cod').textContent = fmt(m.saldo.por_activar);
    let mov = null;
    try { mov = (await api('GET', '/api/me/movimientos?limite=1')).movimientos[0]; } catch { /* sin detalle */ }
    const ganado = mov && mov.tipo === 'compra' && mov.coronas > 0;
    const canje = mov && ['reserva', 'uso_dif'].includes(mov.tipo) && mov.coronas < 0;
    const ascendio = m.rango.indice > (m.rangos.findIndex((x) => x.id === antes.rango));
    if (ganado || ascendio) confeti(ascendio);
    $('#aviso-mov').innerHTML = ganado
      ? `<div class="vaso pop"><div class="espuma"></div><div class="vaso-in">${monedaSVG(64)}<div class="muted peq">Tu consumo quedó registrado</div><div class="gran-num">+${fmt(mov.coronas)}</div><div class="muted">coronas${mov.local ? ' · ' + esc(mov.local) : ''}</div>${ascendio ? `<p style="margin-top:8px"><b>¡Subiste a ${esc(m.rango.nombre)}!</b></p>` : ''}</div></div>`
      : canje
        ? `<div class="ok-grande pop"><div class="sello-ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><h2>Se descontaron ${fmt(-mov.coronas)}</h2><p class="peq muted">${mov.local ? 'En ' + esc(mov.local) + '. ' : ''}Te quedan ${fmt(m.saldo.disponible)} coronas.</p></div>`
        : `<div class="aviso">Tu saldo cambió${mov ? ': ' + esc(mov.titulo) : ''}.</div>`;
  }, 3500);
}

/* ───────────────────────── Registrar boleta ───────────────────────── */

export async function pagBoleta() {
  cargando();
  const me = await cargarYo();
  if (exigirSesion('/boleta')) return;
  let personas = 2;
  let amigos = false;
  let hint = '';
  const mvp = !!me.reglas.mvp;
  const pruebas = mvp ? (await api('GET', '/api/demo/codigos')).codigos : [];

  function filasAmigos() {
    const n = Math.max(0, personas - 1);
    return Array.from({ length: n }, (_, i) => `<div class="fila" style="margin-bottom:8px"><input type="text" class="am-nombre" placeholder="Nombre" maxlength="30" style="flex:.8"><input type="tel" class="am-tel" inputmode="numeric" placeholder="9 1234 5678"></div>`).join('');
  }

  function formulario(error = '', cod = '') {
    pintar(`${cabecera('Código de boleta', 'Si no diste tu código al pagar', true)}
      <div class="card"><label class="campo"><span>Código de tu boleta</span><input id="cod" class="codigo-input" type="text" autocapitalize="characters" autocomplete="off" placeholder="ABC-123" value="${esc(cod)}"></label>
      ${mvp ? `<p class="muted peq" style="margin:-6px 0 8px">Toca un código de prueba y se completa solo. Se pueden usar todas las veces que quieras.</p>
      <div class="codigos-prueba">${pruebas.map((p) => `<button type="button" class="cp" data-cod="${esc(p.codigo)}" data-p="${p.personas}"><b>${esc(p.codigo)}</b><span>${fmt(p.monto)} · ${p.personas} ${p.personas === 1 ? 'persona' : 'personas'}</span></button>`).join('')}</div><div class="sep"></div>` : `<p class="muted peq" style="margin:-6px 0 14px">Lo encuentras impreso en tu boleta, debajo del total. Son 6 letras y números (sin O, I, L, 0 ni 1).</p>`}
      <div class="centro"><span class="muted peq">¿Cuántas personas eran en la mesa?</span></div>
      <div class="stepper" style="margin:8px 0"><button id="menos" aria-label="Una persona menos">−</button><output id="n" aria-live="polite">${personas}</output><button id="mas" aria-label="Una persona más">+</button></div>
      <p class="muted peq centro" id="hint">${esc(hint) || 'La cuenta se reparte en partes iguales entre todos.'}</p>
      <div class="sep"></div>
      <label class="check" style="margin-bottom:6px"><input type="checkbox" id="chk-amigos" ${amigos ? 'checked' : ''}><span>Guardarles su parte a mis amigos por teléfono (opcional)</span></label>
      <div id="amigos" class="${amigos ? '' : 'oculto'}"><p class="muted peq" style="margin-bottom:8px">Solo guardamos un código cifrado de su número. No les escribimos: ellos ven su parte cuando entran al Club.</p><div id="filas">${filasAmigos()}</div></div>
      ${error ? `<div class="error" role="alert" style="margin-top:12px">${esc(error)}</div>` : ''}
      <button class="btn" id="enviar" style="margin-top:12px">Sumar mis coronas</button></div>
      ${mvp ? NOTA_MVP : `<p class="muted peq centro">Tienes ${me.reglas.ventana_reclamo_horas} horas desde que pagas para ingresar el código.</p>`}`, { nav: '/boleta' });
    enlazarAtras();
    const cod2 = $('#cod');
    cod2.addEventListener('input', () => { cod2.value = formatearCodigo(cod2.value); });
    $('#menos').addEventListener('click', () => { personas = Math.max(1, personas - 1); $('#n').textContent = personas; $('#filas').innerHTML = filasAmigos(); });
    $('#mas').addEventListener('click', () => { personas = Math.min(me.reglas.max_personas, personas + 1); $('#n').textContent = personas; $('#filas').innerHTML = filasAmigos(); });
    $('#chk-amigos').addEventListener('change', (e) => { amigos = e.target.checked; $('#amigos').classList.toggle('oculto', !amigos); });
    cod2.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#enviar').click(); });
    $$('.cp').forEach((b) => b.addEventListener('click', () => { personas = Number(b.dataset.p); $('#n').textContent = personas; $('#filas').innerHTML = filasAmigos(); cod2.value = b.dataset.cod; hint = ''; $('#hint').textContent = 'Con este código de prueba la cantidad de personas ya viene definida.'; }));
    $('#enviar').addEventListener('click', enviar);
  }

  async function enviar(ev) {
    const b = ev.currentTarget;
    const codigo = $('#cod').value;
    const lista = [];
    if (amigos) {
      const nombres = $$('.am-nombre');
      const tels = $$('.am-tel');
      tels.forEach((t, i) => { if (t.value.trim()) lista.push({ etiqueta: nombres[i].value.trim(), telefono: t.value }); });
    }
    b.disabled = true;
    b.textContent = 'Revisando…';
    try {
      const r = await api('POST', '/api/boletas/reclamar', { codigo, personas, amigos: lista });
      await cargarYo();
      resultado(r);
    } catch (err) {
      if (err.codigo === 'ya_reclamaste' && err.datos.mesa) return ir(`/m/${err.datos.mesa}`);
      if (err.codigo === 'personas_fuera_de_rango') {
        hint = `Para esta cuenta pueden ser entre ${err.datos.min} y ${err.datos.max} personas.`;
        personas = Math.min(err.datos.max, Math.max(err.datos.min, personas));
      } else if (err.codigo === 'personas_no_coinciden') {
        personas = err.datos.comensales;
        hint = `La boleta indica ${err.datos.comensales} personas.`;
      } else hint = '';
      formulario(err.message, codigo);
    }
  }

  function resultado(r) {
    const url = `${location.origin}/m/${r.mesa.token}`;
    const texto = textoCompartir(estado.me?.usuario.nombre_pila, r.local, r.gasto_sumado, url);
    confeti(r.ascendio);
    pintar(`${cabecera('¡Listo!', r.local)}
      ${vasoGanadas(r)}
      ${r.ascendio ? `<div class="card amarilla centro pop">${medallaSVG(r.rango.id, 84)}<h2 style="margin-top:6px">¡Ascendiste a ${esc(r.rango.nombre)}!</h2><p class="peq">Viniste como ${esc(r.rango_antes)}. Desde tu próxima boleta ganas más coronas.</p></div>` : `<div class="card plano"><div class="rango-card">${medallaSVG(r.rango.id, 56)}<div class="info"><b>${esc(r.rango.nombre)}</b><div class="barra"><i style="width:${Math.round(r.rango.progreso * 100)}%"></i></div><span class="peq muted">${r.rango.siguiente ? `Te faltan ${fmt(r.rango.siguiente.falta)} para ${esc(r.rango.siguiente.nombre)}` : 'Rango máximo'}</span></div></div></div>`}
      ${r.mesa.libres + r.mesa.asignadas > 0 ? `<div class="card"><h2 style="margin-bottom:4px">Tu mesa</h2>
        <p class="muted peq" style="margin-bottom:10px">Cada amigo reclama <b>su parte</b> (${fmt(r.gasto_sumado)}) con este enlace y suma sus coronas. Vence en 48 horas. Quedan ${r.mesa.libres + r.mesa.asignadas} ${r.mesa.libres + r.mesa.asignadas === 1 ? 'lugar' : 'lugares'}.</p>${jarrosMesa({ personas: r.mesa.personas, reclamadas: 1, asignadas: r.mesa.asignadas })}<div class="sep"></div>
        <a class="btn verde" target="_blank" rel="noopener" href="${esc(enlaceWhatsApp(texto))}">Compartir por WhatsApp</a><div class="sep"></div>
        <div class="fila"><button class="btn sec" id="copiar">Copiar enlace</button><button class="btn sec" id="otros">Más…</button></div>
        <p class="muted peq centro" style="margin-top:12px">O que escaneen este QR desde tu celular:</p><div class="qrbox">${qrSvg(url, 180)}</div></div>` : ''}
      <a data-l class="btn" href="/">Volver al inicio</a>`, { nav: '/boleta' });
    $('#copiar')?.addEventListener('click', () => copiar(url));
    $('#otros')?.addEventListener('click', async () => { if (!(await compartirNativo({ title: 'Club del Rey', text: texto, url }))) copiar(url); });
  }

  formulario();
}

/* ───────────────────────── Mesa compartida ───────────────────────── */

export async function pagMesa(token) {
  cargando();
  await cargarYo();
  let m;
  try {
    m = await api('GET', `/api/mesas/${encodeURIComponent(token)}`);
  } catch (err) {
    return pintar(`${cabecera('Mesa', '', true)}<div class="card mal"><b>Este enlace no existe</b><p class="peq muted">Puede que esté mal copiado. Pídele a quien pagó que lo vuelva a enviar.</p></div><a data-l class="btn" href="/">Ir al inicio</a>`, { nav: estado.me ? '/' : '' });
  }
  enlazarAtras();
  const url = `${location.origin}/m/${m.token}`;
  const restan = m.libres + m.asignadas;
  const encabezado = `<div class="card"><div class="rango-card"><span style="font-size:42px;color:var(--y);display:grid">${ico('grupo')}</span><div class="info"><h2>Mesa de ${esc(m.pagador)}</h2><span class="muted peq">${esc(m.local)} · ${m.personas} personas</span></div></div>
    <div class="saldo" style="margin-top:12px"><div class="caja"><small>Tu parte de la cuenta</small><b>${fmt(m.parte)}</b></div><div class="caja"><small>Lugares sin reclamar</small><b>${restan}</b></div></div>${jarrosMesa(m)}
    <p class="peq muted" style="margin-top:10px">La cuenta se reparte en partes iguales. ${m.anulada ? '' : m.expirada ? 'El plazo ya terminó.' : `Este enlace vence ${esc(cuando(m.expira_en, m.ahora))}.`}</p></div>`;

  let accion = '';
  if (m.anulada) accion = `<div class="card mal"><b>La boleta de esta mesa fue anulada</b><p class="peq muted">Ya no se pueden reclamar coronas.</p></div>`;
  else if (m.expirada) accion = `<div class="card alerta"><b>Este enlace venció</b><p class="peq muted">Se podía reclamar durante 48 horas. La próxima vez, avísale a tu grupo antes.</p></div>`;
  else if (!estado.me) accion = `<div class="card amarilla"><b>Entra al Club para reclamar tu parte</b><p class="peq muted">Toma 30 segundos y sumas coronas por tu consumo.</p></div><button class="btn" id="entrar">Entrar o unirme</button>`;
  else if (m.yo?.es_pagador) {
    const texto = textoCompartir(estado.me?.usuario.nombre_pila, m.local, m.parte, url);
    accion = `<div class="card"><h3 style="margin-bottom:8px">Esta es tu mesa</h3><p class="muted peq" style="margin-bottom:12px">Tu parte ya está sumada. Comparte el enlace para que tus amigos reclamen la suya.</p>
      <a class="btn verde" target="_blank" rel="noopener" href="${esc(enlaceWhatsApp(texto))}">Compartir por WhatsApp</a><div class="sep"></div><div class="fila"><button class="btn sec" id="copiar">Copiar enlace</button><button class="btn sec" id="otros">Más…</button></div>
      <div class="qrbox">${qrSvg(url, 180)}</div></div>`;
  } else if (m.yo?.ya_reclamo) accion = `<div class="card ok"><b>${ico('corona')} Ya reclamaste tu parte</b><p class="peq muted">Sumaste ${fmt(m.yo.coronas)} coronas.${estado.me.reglas.horas_activacion > 0 ? ` Se activan ${estado.me.reglas.horas_activacion} horas después de reclamarlas.` : ' Ya están disponibles.'}</p></div><a data-l class="btn" href="/">Ir al inicio</a>`;
  else if (restan === 0) accion = `<div class="card alerta"><b>Esta mesa ya no tiene lugares</b><p class="peq muted">Todas las partes fueron reclamadas.</p></div>`;
  else accion = `${m.yo?.tiene_parte_asignada ? `<div class="card ok"><b>${ico('regalo')} Te guardaron tu parte</b></div>` : ''}<div class="card amarilla centro"><div class="peq muted">Si la reclamas, sumas</div><div class="gran-num" style="color:var(--ink);text-shadow:none">+${fmt(m.coronas_estimadas || 0)}</div><div>coronas</div>${m.mi_rango ? `<div class="peq muted" style="margin-top:6px">Con tu rango ${esc(m.mi_rango.nombre)} ganas el ${m.mi_rango.pct}% de tu parte (${fmt(m.parte)})${m.mi_rango.tope_aplicado ? `, con un máximo de ${fmt(m.tope)} por persona` : ''}. Cada persona gana según su propio rango.</div>` : ''}</div><button class="btn" id="reclamar">Reclamar mi parte</button>`;

  pintar(`${cabecera('Mesa compartida', m.local, true)}${encabezado}${accion}`, { nav: estado.me ? '/' : '' });
  enlazarAtras();
  $('#entrar')?.addEventListener('click', () => { sessionStorage.setItem('rey_next', `/m/${m.token}`); ir('/entrar'); });
  $('#copiar')?.addEventListener('click', () => copiar(url));
  $('#otros')?.addEventListener('click', async () => { if (!(await compartirNativo({ title: 'Club del Rey', url }))) copiar(url); });
  $('#reclamar')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      const r = await api('POST', `/api/mesas/${encodeURIComponent(m.token)}/reclamar`, {});
      await cargarYo();
      confeti(r.ascendio);
      pintar(`${cabecera('¡Listo!', r.local)}
        ${vasoGanadas(r, ` · gracias a ${esc(r.pagador)}`)}
        ${r.ascendio ? `<div class="card amarilla centro pop">${medallaSVG(r.rango.id, 84)}<h2>¡Ascendiste a ${esc(r.rango.nombre)}!</h2></div>` : ''}
        <a data-l class="btn" href="/">Ir al inicio</a>`, { nav: '/' });
    } catch (err) {
      toast(err.message, 'err');
      pagMesa(token);
    }
  });
}

/* ───────────────────────── Canjear ───────────────────────── */

export async function pagCanjear() {
  cargando();
  const me = await cargarYo();
  if (exigirSesion('/canjear')) return;
  if (me.ficha_activa) return vistaFicha(me.ficha_activa);
  const s = me.saldo;
  const r = me.reglas;
  const opciones = [];
  for (let v = r.canje_minimo; v <= Math.min(s.disponible, r.canje_maximo); v += r.canje_multiplo * 2) opciones.push(v);
  let monto = opciones.length ? opciones[Math.min(1, opciones.length - 1)] : 0;

  const puedeCanjear = s.disponible >= r.canje_minimo && r.canjes_hoy < r.canjes_por_dia;
  const regalo = me.regalo;
  pintar(`${cabecera('Canjear coronas', 'Descuento en tu cuenta', true)}
    <div class="card"><div class="saldo"><div class="caja grande"><span class="moneda-lado">${monedaSVG(38)}</span><div><small>Disponibles</small><b>${fmt(s.disponible)}</b></div></div><div class="caja"><small>Por activar</small><b>${fmt(s.por_activar)}</b>${s.por_activar > 0 ? `<div class="nota">Se activan ${esc(cuando(s.proxima_activacion, me.ahora))}</div>` : ''}</div></div></div>
    ${regalo.disponible ? `<div class="card amarilla"><h2>${ico('pastel')} Tu regalo de cumpleaños</h2><p class="peq muted" style="margin:4px 0 12px">${esc(regalo.descripcion)}. Cuando lo uses, lleva tu cédula: te la van a pedir.</p><button class="btn" id="regalo" style="background:var(--ink);color:var(--y)">Pedir mi regalo</button></div>` : ''}
    <a data-l href="/codigo" class="card amarilla" style="display:block;text-decoration:none"><b>${ico('qr')} Descuenta con tu código</b><div class="peq muted" style="margin-top:2px">Díctale <b>${esc(formatearCodigo(me.usuario.codigo_socio))}</b> al garzón antes de pedir la cuenta: ve tus coronas y las descuenta al tiro. Tócalo para mostrarlo.</div></a>
    <div class="card"><h2 style="margin-bottom:10px">O genera una ficha tú mismo</h2>
      ${r.canjes_hoy >= r.canjes_por_dia ? '<div class="aviso">Hoy ya hiciste tu canje. Puedes volver a canjear mañana.</div>' : s.disponible < r.canje_minimo ? `<div class="aviso">${s.por_activar > 0 ? `Tus coronas nuevas se activan ${esc(cuando(s.proxima_activacion, me.ahora))}. Vuelve entonces y las canjeas en tu próxima visita.` : `Necesitas al menos ${fmt(r.canje_minimo)} disponibles para canjear. Suma coronas registrando tus boletas.`}</div>` : ''}
      ${puedeCanjear ? `<div class="chips" id="chips">${opciones.slice(0, 8).map((v) => `<button class="chip ${v === monto ? 'sel' : ''}" data-v="${v}">${fmt(v)}</button>`).join('')}${Math.min(s.disponible, r.canje_maximo) > (opciones.at(-1) || 0) ? `<button class="chip" data-v="${Math.floor(Math.min(s.disponible, r.canje_maximo) / r.canje_multiplo) * r.canje_multiplo}">Todo</button>` : ''}</div>
      <button class="btn" id="generar">Generar ficha de <span id="mv">${fmt(monto)}</span></button>
      <p class="muted peq" style="margin-top:10px">La ficha dura ${r.canje_vigencia_min} minutos. Muéstrasela a tu garzón/a <b>antes de pedir la cuenta</b>: la caja aplica el descuento al emitir la boleta.</p>` : ''}
    </div>
    <div class="card plano"><h3 style="margin-bottom:6px">Cómo funciona</h3><p class="peq muted">${r.horas_activacion > 0 ? `Las coronas que ganas se activan ${r.horas_activacion} horas después, así que se usan en tu próxima visita. ` : 'En esta demostración tus coronas se activan al instante (en el Club real, 24 horas después). '}Puedes hacer ${r.canjes_por_dia} ${r.canjes_por_dia === 1 ? 'canje' : 'canjes'} por día, entre ${fmt(r.canje_minimo)} y ${fmt(r.canje_maximo)}.</p></div>`, { nav: '/canjear' });
  enlazarAtras();
  $$('#chips .chip').forEach((c) => c.addEventListener('click', () => {
    monto = Number(c.dataset.v);
    $$('#chips .chip').forEach((x) => x.classList.toggle('sel', x === c));
    $('#mv').textContent = fmt(monto);
  }));
  $('#generar')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      const r2 = await api('POST', '/api/canjes', { monto });
      await cargarYo();
      vistaFicha(r2.ficha);
    } catch (err) {
      toast(err.message, 'err');
      pagCanjear();
    }
  });
  $('#regalo')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      const r2 = await api('POST', '/api/regalo', {});
      await cargarYo();
      vistaFicha(r2.ficha);
    } catch (err) {
      toast(err.message, 'err');
      pagCanjear();
    }
  });
}

function vistaFicha(ficha) {
  const fin = Date.now() + ficha.restante_seg * 1000;
  const regalo = ficha.tipo === 'regalo';
  pintar(`${cabecera(regalo ? 'Tu regalo' : 'Tu ficha de canje', 'Muéstrala a tu garzón/a', true)}
    <div class="ficha pop"><div class="ficha-cab"><img class="foto" src="/assets/foto-variedad.jpg" alt=""><img class="logo" src="${LOGO}" alt=""></div>
      <div class="ficha-cuerpo"><div class="tipo">${regalo ? 'Regalo de cumpleaños' : 'Descuento Club del Rey'}</div>
      <div class="cod" aria-label="Código ${esc(ficha.codigo)}">${esc(ficha.codigo.slice(0, 3))}-${esc(ficha.codigo.slice(3))}</div>
      <div class="dto">${regalo ? esc(ficha.descripcion) : `Descuento de ${fmt(ficha.monto)}`}</div>
      <div class="linea"></div>
      <div id="estado-ficha"><span class="reloj" id="reloj">--:--</span></div>
      <p class="peq" style="margin-top:10px">${regalo ? 'Lleva tu cédula: la van a pedir para confirmar tu cumpleaños.' : 'El garzón/a la confirma <b>antes</b> de emitir la boleta.'}</p></div></div>
    <div class="card garzon"><h3>${ico('ticket')} Para el garzón/a</h3>
      <p class="peq muted" style="margin:4px 0 12px">${regalo ? 'Pide la cédula, y luego confirma' : 'Confirma el canje frente al cliente'} con el PIN del local. Se descuenta de las coronas del cliente y la caja emite la boleta con el descuento.${estado.me?.reglas.mvp ? ' <b>(Demo: local REY X, PIN 1234)</b>' : ''}</p>
      <button class="btn" id="confirmar">Confirmar canje</button></div>
    <div class="sep"></div><button class="btn peligro" id="cancelar">Cancelar ficha${regalo ? '' : ' y devolver coronas'}</button>`);
  enlazarAtras();
  const reloj = $('#reloj');
  const tic = () => {
    const s = Math.max(0, Math.round((fin - Date.now()) / 1000));
    reloj.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    reloj.classList.toggle('poco', s <= 60);
    if (s === 0) revisar();
  };
  let revisando = false;
  async function revisar() {
    if (revisando) return;
    revisando = true;
    try {
      const me = await cargarYo();
      if (me && !me.ficha_activa) {
        const h = await api('GET', '/api/me/fichas');
        const f = h.fichas.find((x) => x.codigo === ficha.codigo);
        terminada(f);
        return true;
      }
    } catch { /* se reintenta */ } finally { revisando = false; }
    return false;
  }
  function terminada(f) {
    limpiar();
    if (f?.estado === 'usada') {
      confeti();
      pintar(`${cabecera('¡Canjeado!', '')}<div class="ok-grande pop"><div class="sello-ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><h2>${regalo ? '¡Disfruta tu regalo!' : `Se descontaron ${fmt(f.monto_aplicado ?? f.monto)}`}</h2><p class="peq muted">${regalo ? 'Canjeado en caja. ¡Feliz cumpleaños!' : 'Canjeado en caja: la boleta sale con el descuento. Gracias por ser parte del Club del Rey.'}</p>${limonDeco('br', 120)}</div><a data-l class="btn" href="/">Volver al inicio</a>`, { nav: '/' });
    } else {
      pintar(`${cabecera('Ficha terminada', '')}<div class="card alerta centro"><b>${f?.estado === 'cancelada' ? 'Cancelaste la ficha' : 'La ficha venció'}</b><p class="peq muted">${regalo ? '' : 'Tus coronas volvieron a tu saldo.'}</p></div><a data-l class="btn" href="/canjear">Generar otra</a>`, { nav: '/canjear' });
    }
  }
  const t1 = intervalo(tic, 1000);
  const t2 = intervalo(revisar, 4000);
  const limpiar = () => { clearInterval(t1); clearInterval(t2); };
  tic();
  $('#confirmar').addEventListener('click', async () => {
    let locales = [];
    try { locales = (await api('GET', '/api/caja/locales')).locales; } catch { /* sin lista */ }
    let guardado = '';
    try { guardado = localStorage.getItem('rey_local') || ''; } catch { /* sin almacenamiento */ }
    const m = modal(`<h2 style="margin-bottom:6px">Confirmar canje</h2>
      <p class="muted peq" style="margin-bottom:14px">Solo para el personal del local. Ingresa el PIN del local para descontar ${regalo ? 'el regalo' : fmt(ficha.monto)}.</p>
      <label class="campo"><span>Local</span><select id="cf-local">${locales.map((l) => `<option value="${esc(l.codigo)}" ${l.codigo === guardado ? 'selected' : ''}>${esc(l.nombre)}</option>`).join('')}</select></label>
      <label class="campo"><span>PIN del local</span><input id="cf-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="••••"></label>
      <div id="cf-err"></div><div class="fila"><button class="btn sec" id="cf-no">Cancelar</button><button class="btn" id="cf-si">Confirmar</button></div>`);
    $('#cf-pin').focus();
    $('#cf-no').addEventListener('click', m.cerrar);
    const enviar = async () => {
      const si = $('#cf-si');
      si.disabled = true;
      try {
        const local = $('#cf-local').value;
        await api('POST', '/api/canjes/confirmar', { local, pin: $('#cf-pin').value });
        try { localStorage.setItem('rey_local', local); } catch { /* sin almacenamiento */ }
        m.cerrar();
        await revisar();
      } catch (err) {
        si.disabled = false;
        $('#cf-err').innerHTML = `<div class="error" role="alert">${esc(err.message)}</div>`;
        if (err.codigo === 'sin_ficha' || err.codigo === 'ficha_usada') { m.cerrar(); await revisar(); }
      }
    };
    $('#cf-si').addEventListener('click', enviar);
    $('#cf-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
  });
  $('#cancelar').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      await api('POST', '/api/canjes/cancelar', {});
      await cargarYo();
      toast('Ficha cancelada');
      ir('/canjear', true);
    } catch (err) {
      toast(err.message, 'err');
      ir('/canjear', true);
    }
  });
}

/* ───────────────────────── Rangos ───────────────────────── */

export async function pagRangos() {
  cargando();
  await cargarYo();
  const [r, salon] = await Promise.all([api('GET', '/api/rangos'), api('GET', '/api/salon')]);
  const me = estado.me;
  const actual = me?.rango.indice ?? -1;
  pintar(`${cabecera('Rangos del Club', 'De Plebeyo a Rey', !!me)}
    <div class="card"><div class="escalera">${r.rangos.map((x, i) => `<div class="escalon ${i === actual ? 'act' : ''} ${i < actual ? 'lograda' : ''}">${medallaSVG(x.id, 72)}<div class="d"><b>${esc(x.nombre)} ${i === actual ? '<span class="etiqueta ambar">Tú estás aquí</span>' : i < actual ? '✓' : ''}</b><span>${i === 0 ? 'Desde que te unes' : `Desde ${fmt(x.desde)} de consumo`}</span><span>${esc(x.beneficio)}</span></div></div>`).join('')}</div></div>
    <div class="card"><h2 style="margin-bottom:10px">Cómo ganas coronas</h2><div class="pasos">
      <div class="paso"><div><b>Dile tu código al garzón</b><span>Antes de pedir la cuenta: ve tus coronas, las descuenta, y al emitir la boleta se te acreditan.</span></div></div>
      <div class="paso"><div><b>La cuenta se reparte en partes iguales</b><span>Cada amigo que da su código suma su parte; cada uno gana según su propio rango.</span></div></div>
      <div class="paso"><div><b>¿Alguien no dio su código?</b><span>Puede ingresar el código de su boleta en la app, o reclamar su parte con el enlace de la mesa durante ${r.reglas.ventana_mesa_horas} horas.</span></div></div>
      <div class="paso"><div><b>Vuelve y canjea</b><span>${r.reglas.horas_activacion > 0 ? `Las coronas se activan a las ${r.reglas.horas_activacion} horas. ` : ''}Máximo ${fmt(r.reglas.tope_coronas_por_persona)} en coronas por persona en cada boleta.</span></div></div></div>
      <p class="peq muted" style="margin-top:12px">Si pasan ${r.reglas.meses_inactividad_vence} meses sin movimientos, las coronas disponibles vencen.</p></div>
    <div class="card"><h2 style="margin-bottom:10px">Salón del Rey</h2>${salon.salon.length ? `<div class="lista">${salon.salon.map((s, i) => `<div class="item"><span class="em">${i + 1}</span><span class="tx"><b>${esc(s.nombre)}</b><span>${esc(s.rango)}</span></span>${medallaSVG(s.rango_id, 34)}</div>`).join('')}</div>` : '<p class="muted peq">Aún no hay nadie en el Salón. Los socios deciden si quieren aparecer desde su perfil.</p>'}</div>`, { nav: me ? '/rangos' : '' });
  enlazarAtras();
}

/* ───────────────────────── Historial ───────────────────────── */

export async function pagHistorial() {
  cargando();
  await cargarYo();
  if (exigirSesion('/historial')) return;
  const [m, f] = await Promise.all([api('GET', '/api/me/movimientos?limite=100'), api('GET', '/api/me/fichas')]);
  pintar(`${cabecera('Mis movimientos', '', true)}
    <div class="card">${m.movimientos.length ? `<div class="lista">${m.movimientos.map(filaMovimiento).join('')}</div>` : '<p class="muted">Todavía no tienes movimientos.</p>'}</div>
    ${f.fichas.length ? `<div class="card"><h3 style="margin-bottom:10px">Mis fichas</h3><div class="lista">${f.fichas.map((x) => `<div class="item"><span class="em">${x.tipo === 'regalo' ? '🎂' : '🎟️'}</span><span class="tx"><b>${x.tipo === 'regalo' ? esc(x.descripcion) : fmt(x.monto)}</b><span>${esc(cuando(x.creada_en))}</span></span><span class="etiqueta ${x.estado === 'usada' ? 'verde' : x.estado === 'reservada' ? 'ambar' : 'rojo'}">${esc(x.estado)}</span></div>`).join('')}</div></div>` : ''}`, { nav: '/perfil' });
  enlazarAtras();
}

/* ───────────────────────── Perfil ───────────────────────── */

async function imagenRango(me) {
  const W = 1080, H = 1920;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const fondo = g.createLinearGradient(0, 0, 0, H);
  fondo.addColorStop(0, '#2a1d0b'); fondo.addColorStop(1, '#0c0a07');
  g.fillStyle = fondo; g.fillRect(0, 0, W, H);
  const cargar = (src) => new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = src; });
  try {
    const logo = await cargar(LOGO);
    g.save(); g.beginPath(); g.arc(W / 2, 330, 150, 0, 7); g.clip(); g.drawImage(logo, W / 2 - 150, 180, 300, 300); g.restore();
    g.lineWidth = 12; g.strokeStyle = '#f7b22a'; g.beginPath(); g.arc(W / 2, 330, 156, 0, 7); g.stroke();
    const svg = medallaSVG(me.rango.id, 520);
    const med = await cargar('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    g.drawImage(med, W / 2 - 260, 640, 520, 520);
  } catch { /* sin imágenes igual sale el texto */ }
  try { await document.fonts.load('150px Anton'); } catch { /* usa la tipografía de respaldo */ }
  try {
    const limon = await cargar('/assets/limon.svg');
    g.save(); g.translate(W - 120, H - 140); g.rotate(-0.35); g.drawImage(limon, -230, -230, 460, 460); g.restore();
    g.save(); g.translate(110, 1500); g.rotate(0.5); g.globalAlpha = 0.9; g.drawImage(limon, -150, -150, 300, 300); g.restore();
  } catch { /* sin limón */ }
  g.textAlign = 'center';
  g.fillStyle = '#fbf5e8'; g.font = '800 54px "Plus Jakarta Sans", system-ui, sans-serif';
  g.fillText('Yo soy', W / 2, 590);
  // el nombre del rango se achica hasta caber en el ancho de la historia
  let tam = 230;
  const nombreRango = me.rango.nombre.toUpperCase();
  g.fillStyle = '#f7b22a';
  do { g.font = `${tam}px Anton, Impact, sans-serif`; tam -= 6; } while (g.measureText(nombreRango).width > W - 120 && tam > 40);
  g.fillText(nombreRango, W / 2, 1310);
  g.fillStyle = '#fbf5e8'; g.font = '700 56px "Plus Jakarta Sans", system-ui, sans-serif';
  g.fillText(`${me.usuario.nombre_pila} · Club del Rey`, W / 2, 1410);
  g.fillStyle = '#b9ab8f'; g.font = '600 46px "Plus Jakarta Sans", system-ui, sans-serif';
  g.fillText('El Rey de las Micheladas', W / 2, 1480);
  g.fillStyle = '#f7b22a'; g.font = '800 64px "Plus Jakarta Sans", system-ui, sans-serif';
  g.fillText('¿Y tú qué rango eres?', W / 2, 1680);
  g.fillStyle = '#b9ab8f'; g.font = '600 40px "Plus Jakarta Sans", system-ui, sans-serif';
  g.fillText(location.host, W / 2, 1760);
  return new Promise((ok) => cv.toBlob(ok, 'image/png'));
}

export async function pagPerfil() {
  cargando();
  const me = await cargarYo();
  if (exigirSesion('/perfil')) return;
  const u = me.usuario;
  pintar(`${cabecera('Mi perfil', u.nombre)}
    <div class="card"><div class="rango-card">${medallaSVG(me.rango.id, 64)}<div class="info"><h2>${esc(u.nombre)}</h2><span class="muted peq">${esc(me.rango.nombre)} · ${esc(u.telefono)}</span></div></div>
      <div class="sep"></div><button class="btn" id="compartir-rango">Compartir mi rango</button></div>
    <div class="card"><h3 style="margin-bottom:10px">Mis datos</h3>
      <div class="lista"><div class="item"><span class="tx"><b>Cumpleaños</b><span>${esc(u.nacimiento.split('-').reverse().join('/'))}</span></span></div>
      <div class="item"><span class="tx"><b>Mis movimientos</b><span>Coronas ganadas y canjes</span></span><a data-l class="btn chico sec" href="/historial">Ver</a></div></div>
      <label class="check" style="margin:14px 0 0"><input type="checkbox" id="salon" ${u.publico_salon ? 'checked' : ''}><span>Quiero aparecer en el Salón del Rey (con mi nombre abreviado, ej. "${esc(u.nombre_pila)} ${esc((u.nombre.split(' ').at(-1) || '')[0] || '')}.")</span></label></div>
    <div class="card"><h3 style="margin-bottom:10px">Privacidad</h3>
      <div class="fila"><button class="btn sec" id="datos">Descargar mis datos</button><button class="btn sec" id="salir">Cerrar sesión</button></div><div class="sep"></div>
      <button class="btn peligro" id="eliminar">Eliminar mi cuenta</button>
      <p class="peq muted" style="margin-top:10px"><a data-l href="/terminos">Términos del Club</a></p></div>`, { nav: '/perfil' });
  $('#compartir-rango').addEventListener('click', async (e) => {
    const boton = e.currentTarget;
    boton.disabled = true;
    try {
      const blob = await imagenRango(me);
      const archivo = new File([blob], 'mi-rango-club-del-rey.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [archivo] })) {
        try { await navigator.share({ files: [archivo], text: `Soy ${me.rango.nombre} en el Club del Rey 👑` }); } catch { /* cancelado */ }
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = archivo.name; a.click();
        toast('Imagen descargada. ¡Súbela a tus historias!');
      }
    } finally { boton.disabled = false; }
  });
  $('#salon').addEventListener('change', async (e) => {
    try { await api('POST', '/api/me/salon', { publico: e.target.checked }); toast(e.target.checked ? 'Apareces en el Salón del Rey' : 'Ya no apareces en el Salón'); } catch (err) { toast(err.message, 'err'); }
  });
  $('#datos').addEventListener('click', async () => {
    try {
      const d = await api('GET', '/api/me/datos');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
      a.download = 'mis-datos-club-del-rey.json'; a.click();
    } catch (err) { toast(err.message, 'err'); }
  });
  $('#salir').addEventListener('click', async () => {
    await api('POST', '/api/auth/salir', {});
    estado.me = null;
    ir('/', true);
  });
  $('#eliminar').addEventListener('click', () => {
    const { el, cerrar } = modal(`<h2>¿Eliminar tu cuenta?</h2><p class="muted" style="margin:10px 0">Se borran tu nombre, teléfono y cumpleaños, y pierdes tus coronas y tu rango. No se puede deshacer.</p>
      <label class="campo"><span>Escribe ELIMINAR para confirmar</span><input id="conf" type="text" autocomplete="off"></label>
      <div class="fila"><button class="btn sec" id="no">Cancelar</button><button class="btn peligro" id="si">Eliminar</button></div>`);
    $('#no', el).addEventListener('click', cerrar);
    $('#si', el).addEventListener('click', async () => {
      if ($('#conf', el).value.trim().toUpperCase() !== 'ELIMINAR') return toast('Escribe ELIMINAR para confirmar', 'err');
      try {
        await api('POST', '/api/me/eliminar', { confirmar: true });
        estado.me = null;
        cerrar();
        toast('Tu cuenta fue eliminada');
        ir('/', true);
      } catch (err) { toast(err.message, 'err'); }
    });
  });
}

/* ───────────────────────── Términos ───────────────────────── */

export function pagTerminos() {
  pintar(`${cabecera('Términos del Club', 'Club del Rey', true)}
    <div class="card"><h3>Quiénes pueden participar</h3><p class="muted peq" style="margin:6px 0 14px">Personas mayores de 18 años. Consume alcohol de forma responsable: no manejes si bebiste.</p>
    <h3>Coronas y rangos</h3><p class="muted peq" style="margin:6px 0 14px">Ganas coronas por tu consumo al ingresar el código de tu boleta dentro de las 24 horas siguientes. La cuenta se reparte en partes iguales entre las personas de la mesa; cada persona reclama la suya. Las coronas se activan 24 horas después y se canjean como descuento en tu cuenta. Tu rango depende de lo que consumes en 12 meses.</p>
    <h3>Límites y vencimiento</h3><p class="muted peq" style="margin:6px 0 14px">Hay topes por boleta, por día y por semana para evitar abusos. Si pasan 12 meses sin movimientos, las coronas disponibles vencen. El Rey puede bloquear cuentas con uso indebido y ajustar las reglas avisando en la app.</p>
    <h3>Tus datos</h3><p class="muted peq" style="margin:6px 0 14px">Guardamos tu nombre, teléfono y cumpleaños para administrar el Club y regalarte en tu día. Los teléfonos de tus amigos que ingreses se guardan cifrados y solo sirven para asignarles su parte. Puedes descargar tus datos o eliminar tu cuenta cuando quieras desde tu perfil.</p>
    <p class="muted peq">Estos términos son un resumen para la versión de prueba y deben ser revisados con el abogado del Rey antes de lanzar.</p></div>`, { nav: estado.me ? '/perfil' : '' });
  enlazarAtras();
}
