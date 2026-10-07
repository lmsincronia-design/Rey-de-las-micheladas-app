// Pantalla de caja: buscar al cliente por su CÓDIGO PERSONAL, descontar sus coronas antes de emitir la boleta,
// acreditar la boleta a los socios de la mesa y (solo en demostración) simular la emisión de la boleta.
import { $, $$, esc, fmt, api, toast, intervalo, hora, formatearCodigo } from './util.js';
import { medallaSVG } from './iconos.js';
import { monedaSVG } from './moneda.js';

const app = document.getElementById('app');
const LOGO = '/assets/logo-rey.jpg';

export async function pagCaja() {
  app.className = 'ancho';
  let yo;
  try {
    yo = await api('GET', '/api/caja/yo');
  } catch {
    return login();
  }
  panel(yo);
}

async function login(error = '', seleccionado = '') {
  let locales = [];
  try { locales = (await api('GET', '/api/caja/locales')).locales; } catch { /* sin lista */ }
  app.innerHTML = `<div style="max-width:420px;margin:30px auto">
    <div class="hero"><img class="logo" src="${LOGO}" alt=""><h1>Caja · Club del Rey</h1><p>Ingresa con el PIN de tu local.</p></div>
    <div class="card">${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
    <label class="campo"><span>Local</span><select id="local">${locales.map((l) => `<option value="${esc(l.codigo)}" ${l.codigo === seleccionado ? 'selected' : ''}>${esc(l.nombre)}</option>`).join('')}</select></label>
    <label class="campo"><span>PIN</span><input id="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••"></label>
    <button class="btn" id="entrar">Entrar</button></div></div>`;
  const entrar = async () => {
    const local = $('#local').value;
    try {
      await api('POST', '/api/caja/login', { local, pin: $('#pin').value });
      pagCaja();
    } catch (e) { login(e.message, local); }
  };
  $('#entrar').addEventListener('click', entrar);
  $('#pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
  $('#pin').focus();
}

function panel(yo) {
  const local = yo.local;
  // estado de la mesa que se está atendiendo
  let mesa = []; // [{codigo, nombre, rango, pct}] — el primero es quien paga
  let canjeCodigo = '';
  let descuento = 0;

  app.innerHTML = `${yo.demo ? '<div class="demo-banner">MODO DEMOSTRACIÓN · la emisión de boletas de prueba solo existe aquí</div>' : ''}
    <header class="cabecera"><img src="${LOGO}" alt=""><div class="tit"><b>Caja · ${esc(local.nombre)}</b><span>Club del Rey</span></div><button class="btn chico sec" id="salir">Salir</button></header>
    <div class="panel-grid">
      <section class="card"><h2 style="margin-bottom:4px">1. Cliente por código</h2>
        <p class="muted peq" style="margin-bottom:12px">Pídele su <b>código personal</b> (lo ve en la app, pestaña "Mi código") <b>antes de emitir la boleta</b>: así ves sus coronas y el descuento queda en el total.</p>
        <div class="fila"><input id="cli" class="codigo-input" style="font-size:28px !important" type="text" autocomplete="off" placeholder="ABC-123"><button class="btn chico" id="buscarCli" style="flex:0 0 auto">Buscar</button></div>
        <div id="cliente" style="margin-top:14px"></div></section>
      ${yo.demo ? `<section class="card"><h2 style="margin-bottom:4px">2. Emitir boleta (prueba)</h2>
        <p class="muted peq" style="margin-bottom:12px">En producción la caja manda la boleta sola por API (con los códigos de la mesa). Esto simula esa llegada.</p>
        <div class="muted peq" style="margin-bottom:6px"><b>Socios de la mesa</b> (el primero es quien paga)</div>
        <div id="mesa" class="chips" style="margin-bottom:8px"></div>
        <div class="fila" style="margin-bottom:10px"><input id="otro" type="text" placeholder="Agregar otro código" autocomplete="off" style="text-transform:uppercase"><button class="btn chico sec" id="agregarOtro" style="flex:0 0 auto">Agregar</button></div>
        <div class="fila"><label class="campo"><span>Total a cobrar (con descuento)</span><input id="monto" type="number" inputmode="numeric" min="1" step="1" value="150000"></label>
        <label class="campo"><span>Comensales</span><input id="comens" type="number" inputmode="numeric" min="1" step="1" placeholder="—"></label></div>
        <div id="dcto" class="muted peq" style="margin-bottom:10px"></div>
        <button class="btn" id="emitir">Emitir boleta y acreditar</button><div id="ticket"></div></section>` : ''}
      <section class="card"><h2 style="margin-bottom:4px">Ficha de canje (otra forma)</h2>
        <p class="muted peq" style="margin-bottom:12px">Si el cliente generó una ficha en su app, ingrésala aquí.</p>
        <div class="fila"><input id="cod" class="codigo-input" style="font-size:24px !important" type="text" autocomplete="off" placeholder="ABC-123"><button class="btn chico sec" id="buscar" style="flex:0 0 auto">Buscar</button></div>
        <div id="ficha" style="margin-top:14px"></div></section>
      <section class="card" style="grid-column:1/-1"><div class="fila" style="margin-bottom:10px"><h2>Boletas de hoy</h2><button class="btn chico sec" id="refrescar" style="flex:0 0 auto">Actualizar</button></div>
        <div class="scroll-x" id="tabla"></div></section>
    </div>`;
  $('#salir').addEventListener('click', async () => { await api('POST', '/api/caja/salir', {}); pagCaja(); });

  /* ───────── 1. Cliente por código ───────── */
  const cli = $('#cli');
  cli.addEventListener('input', () => { cli.value = formatearCodigo(cli.value); });
  cli.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscarCliente(); });
  $('#buscarCli').addEventListener('click', buscarCliente);
  cli.focus();

  async function buscarCliente() {
    const cont = $('#cliente');
    cont.innerHTML = '<div class="muted">Buscando…</div>';
    try {
      const r = await api('GET', `/api/caja/socios/${encodeURIComponent(cli.value)}`);
      pintarCliente(r.socio);
    } catch (e) { cont.innerHTML = `<div class="error" role="alert">${esc(e.message)}</div>`; }
  }

  function pintarCliente(s, aviso = '') {
    const cont = $('#cliente');
    const c = s.canje;
    const enMesa = mesa.some((m) => m.codigo === s.codigo);
    cont.innerHTML = `<div class="card ok" style="margin:0">
      <div class="fila" style="align-items:center"><div><b style="font-size:22px">${esc(s.nombre)}</b><div class="muted peq">${esc(s.rango.nombre)} · ${s.rango.pct}% · código ${esc(formatearCodigo(s.codigo))}</div></div>${medallaSVG(s.rango.id, 56)}</div>
      <div class="saldo" style="margin-top:12px"><div class="caja grande"><span class="moneda-lado">${monedaSVG(38)}</span><div><small>Coronas disponibles</small><b>${fmt(s.coronas.disponible)}</b></div></div>
        <div class="caja"><small>Por activar</small><b>${fmt(s.coronas.por_activar)}</b></div></div>
      ${aviso ? `<div class="aviso" style="margin-top:12px">${aviso}</div>` : ''}
      ${c.puede ? `<label class="campo" style="margin-top:12px"><span>Descuento a aplicar (de ${fmt(c.multiplo)} en ${fmt(c.multiplo)}, entre ${fmt(c.minimo)} y ${fmt(c.maximo_ahora)})</span>
        <div class="chips" id="sug" style="margin-bottom:8px">${c.sugeridos.map((v) => `<button type="button" class="chip" data-v="${v}">${fmt(v)}</button>`).join('')}</div>
        <input id="dmonto" type="number" inputmode="numeric" min="${c.minimo}" max="${c.maximo_ahora}" step="${c.multiplo}" value="${c.sugeridos[Math.min(1, c.sugeridos.length - 1)] ?? c.minimo}"></label>
        <button class="btn verde" id="aplicarCli">Aplicar descuento a la cuenta</button>` : `<p class="muted peq" style="margin-top:12px">Sin descuento por ahora: ${esc(c.motivo || '')}</p>`}
      ${s.regalo.disponible ? `<div class="aviso" style="margin-top:12px"><b>Cumpleaños:</b> ${esc(s.regalo.descripcion)}. Pide la cédula: debe decir <b>${esc(s.regalo.nacimiento)}</b>.
        <label class="check" style="margin:8px 0 0"><input type="checkbox" id="cedula"><span>Revisé la cédula, coincide</span></label>
        <button class="btn sec" id="regaloCli" style="margin-top:8px" disabled>Entregar regalo</button></div>` : ''}
      ${yo.demo ? `<button class="btn ${enMesa ? 'sec' : ''}" id="sumarMesa" style="margin-top:12px" ${enMesa ? 'disabled' : ''}>${enMesa ? 'Ya está en la mesa' : 'Sumar a la mesa (acreditar su consumo)'}</button>` : ''}
    </div>`;
    $$('#sug .chip', cont).forEach((b) => b.addEventListener('click', () => { $('#dmonto').value = b.dataset.v; }));
    $('#aplicarCli')?.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const r = await api('POST', `/api/caja/socios/${s.codigo}/canje`, { monto: Number($('#dmonto').value) });
        canjeCodigo = r.canje_codigo;
        descuento = r.descuento;
        pintarCliente(r.socio, `✅ <b>Descuento de ${fmt(r.descuento)} aplicado.</b> Emite la boleta con ese descuento y envíala con el código de descuento <b>${esc(formatearCodigo(r.canje_codigo))}</b>.`);
        actualizarMesa();
      } catch (err) {
        toast(err.message, 'err');
        b.disabled = false;
      }
    });
    $('#cedula')?.addEventListener('change', (e) => { $('#regaloCli').disabled = !e.target.checked; });
    $('#regaloCli')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try {
        const r = await api('POST', `/api/caja/socios/${s.codigo}/regalo`, { cedula_verificada: true });
        pintarCliente(r.socio, `✅ <b>Regalo entregado:</b> ${esc(r.regalo)}.`);
      } catch (err) {
        toast(err.message, 'err');
        e.currentTarget.disabled = false;
      }
    });
    $('#sumarMesa')?.addEventListener('click', () => {
      if (!mesa.some((m) => m.codigo === s.codigo)) mesa.push({ codigo: s.codigo, nombre: s.nombre, rango: s.rango.nombre, pct: s.rango.pct });
      actualizarMesa();
      pintarCliente(s);
    });
  }

  /* ───────── Mesa (boleta de prueba) ───────── */
  function actualizarMesa() {
    const cont = $('#mesa');
    if (!cont) return;
    cont.innerHTML = mesa.length
      ? mesa.map((m, i) => `<span class="chip sel" style="cursor:default">${i === 0 ? '👑 ' : ''}${esc(m.nombre)} · ${esc(m.rango)} <button type="button" data-q="${esc(m.codigo)}" aria-label="Quitar" style="background:none;border:0;font-weight:800;cursor:pointer;margin-left:4px">×</button></span>`).join('')
      : '<span class="muted peq">Busca clientes arriba y súmalos a la mesa, o escribe un código abajo.</span>';
    $$('[data-q]', cont).forEach((b) => b.addEventListener('click', () => { mesa = mesa.filter((m) => m.codigo !== b.dataset.q); actualizarMesa(); }));
    const d = $('#dcto');
    if (d) d.innerHTML = descuento ? `Descuento ya aplicado: <b>${fmt(descuento)}</b> (código ${esc(formatearCodigo(canjeCodigo))}). El total de la boleta debe ser el que cobras <b>después</b> del descuento.` : '';
  }
  actualizarMesa();
  $('#agregarOtro')?.addEventListener('click', async () => {
    const campo = $('#otro');
    try {
      const r = await api('GET', `/api/caja/socios/${encodeURIComponent(campo.value)}`);
      if (!mesa.some((m) => m.codigo === r.socio.codigo)) mesa.push({ codigo: r.socio.codigo, nombre: r.socio.nombre, rango: r.socio.rango.nombre, pct: r.socio.rango.pct });
      campo.value = '';
      actualizarMesa();
    } catch (e) { toast(e.message, 'err'); }
  });

  let folio = Number(sessionStorage.getItem('rey_folio') || 5000 + Math.floor(Math.random() * 900));
  $('#emitir')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    const comens = $('#comens').value.trim();
    const cuerpo = { folio: String(++folio), monto: Number($('#monto').value), emitida_en: Date.now() };
    if (comens) cuerpo.comensales = Number(comens);
    if (canjeCodigo) cuerpo.canje_codigo = canjeCodigo;
    if (mesa.length) cuerpo.socios = mesa.map((m) => m.codigo);
    sessionStorage.setItem('rey_folio', String(folio));
    try {
      const r = await api('POST', '/api/caja/boletas', cuerpo);
      const bo = r.boleta;
      const ac = r.acreditacion;
      $('#ticket').innerHTML = `<div class="ticket pop"><div class="c"><b>EL REY DE LAS MICHELADAS</b><br>${esc(local.nombre)}</div><hr>
        <div>Boleta electrónica Nº ${esc(bo.folio)}</div><div>${new Date(bo.emitida_en).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</div>
        ${bo.comensales ? `<div>Personas: ${bo.comensales}</div>` : ''}<hr>
        ${r.canje?.ok ? `<div class="t"><span>Dcto. Club del Rey</span><span>-${fmt(r.canje.ficha.monto_aplicado)}</span></div>` : ''}
        <div class="t"><span>TOTAL</span><span>${fmt(bo.monto)}</span></div><hr>
        ${ac?.ok ? `<div class="club">CLUB DEL REY<b>✔</b>Coronas acreditadas a ${ac.socios.length} ${ac.socios.length === 1 ? 'socio' : 'socios'}</div>`
    : `<div class="club">CLUB DEL REY<b>${esc(bo.codigo.slice(0, 3))}-${esc(bo.codigo.slice(3))}</b>Ingresa este código en la app</div>`}</div>
        ${r.canje && !r.canje.ok ? `<div class="aviso">Descuento no vinculado: ${esc(r.canje.mensaje)}</div>` : ''}
        ${ac && !ac.ok ? `<div class="error">No se acreditó: ${esc(ac.mensaje)}</div>` : ''}
        ${ac?.ok ? `<div class="card ok" style="margin-top:10px"><h3 style="margin-bottom:8px">Coronas acreditadas</h3><div class="lista">${ac.socios.map((s) => `<div class="item"><span class="tx"><b>${esc(s.nombre)}${s.ascendio ? ` · ¡subió a ${esc(s.rango)}!` : ''}</b><span>${esc(s.rango_antes)} · ${s.pct}% de su parte${s.tope_aplicado ? ' (con tope)' : ''}</span></span><span class="monto pos">+${fmt(s.coronas)}</span></div>`).join('')}</div>
          ${ac.mesa.libres > 0 ? `<p class="muted peq" style="margin-top:8px">Quedan ${ac.mesa.libres} ${ac.mesa.libres === 1 ? 'parte libre' : 'partes libres'}: quien pagó puede compartir el enlace de la mesa desde su app.</p>` : ''}</div>` : ''}`;
      // la mesa y el descuento ya se usaron
      if (ac?.ok) { mesa = []; }
      canjeCodigo = '';
      descuento = 0;
      actualizarMesa();
      cargarTabla();
      if (cli.value.length >= 6) buscarCliente();
    } catch (err) {
      toast(err.message, 'err');
    } finally { b.disabled = false; }
  });

  /* ───────── Ficha de canje (otra forma) ───────── */
  const cod = $('#cod');
  cod.addEventListener('input', () => { cod.value = formatearCodigo(cod.value); });
  cod.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });
  $('#buscar').addEventListener('click', buscar);

  async function buscar() {
    const cont = $('#ficha');
    cont.innerHTML = '<div class="muted">Buscando…</div>';
    try {
      const { ficha } = await api('GET', `/api/caja/fichas/${encodeURIComponent(cod.value)}`);
      pintarFicha(ficha);
    } catch (e) { cont.innerHTML = `<div class="error" role="alert">${esc(e.message)}</div>`; }
  }

  function pintarFicha(f) {
    const cont = $('#ficha');
    const regalo = f.tipo === 'regalo';
    const activa = f.estado === 'reservada';
    const fin = Date.now() + f.restante_seg * 1000;
    cont.innerHTML = `<div class="card ${activa ? 'ok' : 'mal'}" style="margin:0">
      <div class="fila"><div><b style="font-size:20px">${esc(f.cliente?.nombre || 'Cliente')}</b><div class="muted peq">${esc(f.cliente?.rango || '')}</div></div>${f.cliente ? medallaSVG(f.cliente.rango_id || 'plebeyo', 46) : ''}</div>
      <div style="margin:10px 0"><span class="etiqueta ${activa ? 'verde' : f.estado === 'usada' ? 'ambar' : 'rojo'}">${esc(f.estado)}</span> ${activa ? `<span class="etiqueta" id="vigencia">--:--</span>` : ''}</div>
      <div class="gran-num" style="font-size:40px">${regalo ? esc(f.descripcion) : fmt(f.monto)}</div>
      ${f.pedir_cedula ? '<div class="aviso" style="margin-top:10px">Pide la cédula y confirma que hoy es su cumpleaños.</div>' : ''}
      ${activa ? `${regalo ? '' : `<label class="campo" style="margin-top:12px"><span>Descuento a aplicar (máx. ${fmt(f.monto)})</span><input id="aplicado" type="number" inputmode="numeric" min="0" max="${f.monto}" step="1" value="${f.monto}"></label>`}
        <button class="btn verde" id="aplicar" style="margin-top:8px">${regalo ? 'Entregar regalo' : 'Aplicar descuento a la cuenta'}</button>` : `<p class="muted peq" style="margin-top:10px">${f.estado === 'usada' ? 'Esta ficha ya se usó.' : 'Esta ficha ya no sirve. El cliente debe generar otra.'}</p>`}
    </div>`;
    if (activa) {
      const v = $('#vigencia');
      const t = intervalo(() => {
        const s = Math.max(0, Math.round((fin - Date.now()) / 1000));
        v.textContent = s ? `vence en ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'vencida';
      }, 1000);
      $('#aplicar').addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        const cuerpo = regalo ? {} : { monto_aplicado: Number($('#aplicado').value) };
        try {
          const r = await api('POST', `/api/caja/fichas/${f.codigo}/aplicar`, cuerpo);
          clearInterval(t);
          cont.innerHTML = `<div class="ok-grande pop" style="margin:0"><div class="sello-ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><h2>${regalo ? 'Regalo entregado' : `Descuento de ${fmt(r.ficha.monto_aplicado)} aplicado`}</h2><p class="muted peq">Ahora emite la boleta con el total ya descontado.</p></div>`;
          cod.value = '';
          cod.focus();
        } catch (err) {
          toast(err.message, 'err');
          buscar();
        }
      });
    }
  }

  async function cargarTabla() {
    try {
      const r = await api('GET', '/api/caja/boletas');
      $('#tabla').innerHTML = r.boletas.length ? `<table><thead><tr><th>Hora</th><th>Folio</th><th>Código</th><th>Total</th><th>Personas</th><th>Estado</th><th></th></tr></thead><tbody>${r.boletas.map((b) => `<tr><td>${hora(b.emitida_en)}</td><td>${esc(b.folio)}</td><td><b>${esc(b.codigo.slice(0, 3))}-${esc(b.codigo.slice(3))}</b></td><td>${fmt(b.monto)}</td><td>${b.personas ?? b.comensales ?? '—'}</td><td><span class="etiqueta ${b.estado === 'reclamada' ? 'verde' : b.estado === 'anulada' ? 'rojo' : ''}">${esc(b.estado)}${b.reclamadas > 1 ? ` · ${b.reclamadas} socios` : ''}</span></td><td>${b.estado !== 'anulada' ? `<button class="btn chico sec" data-anular="${esc(b.folio)}">Anular</button>` : ''}</td></tr>`).join('')}</tbody></table><p class="muted peq" style="margin-top:8px">Total del día: <b>${fmt(r.total)}</b></p>` : '<p class="muted">Todavía no hay boletas hoy.</p>';
      $$('[data-anular]').forEach((btn) => btn.addEventListener('click', async () => {
        if (!confirm(`¿Anular la boleta ${btn.dataset.anular}? Si el cliente ya sumó coronas, se le descuentan.`)) return;
        try { await api('POST', '/api/caja/boletas/anular', { folio: btn.dataset.anular }); toast('Boleta anulada'); cargarTabla(); } catch (e) { toast(e.message, 'err'); }
      }));
    } catch (e) { $('#tabla').innerHTML = `<div class="error">${esc(e.message)}</div>`; }
  }
  $('#refrescar').addEventListener('click', cargarTabla);
  intervalo(cargarTabla, 15000);
  cargarTabla();
}
