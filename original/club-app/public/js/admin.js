// Panel de administración del Rey.
import { $, $$, esc, fmt, api, toast, modal, qrSvg, copiar, cuando, hora } from './util.js';
import { medallaSVG } from './iconos.js';

const app = document.getElementById('app');
const LOGO = '/assets/logo-rey.jpg';
let pestana = 'resumen';

export async function pagAdmin() {
  app.className = 'ancho';
  try {
    await api('GET', '/api/admin/resumen');
  } catch {
    return login();
  }
  marco();
}

function login(error = '') {
  app.innerHTML = `<div style="max-width:420px;margin:30px auto"><div class="hero"><img class="logo" src="${LOGO}" alt=""><h1>Administración</h1><p>Club del Rey</p></div>
    <div class="card">${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
    <label class="campo"><span>Clave</span><input id="clave" type="password" autocomplete="current-password"></label><button class="btn" id="entrar">Entrar</button></div></div>`;
  const entrar = async () => {
    try { await api('POST', '/api/admin/login', { password: $('#clave').value }); pagAdmin(); } catch (e) { login(e.message); }
  };
  $('#entrar').addEventListener('click', entrar);
  $('#clave').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
  $('#clave').focus();
}

const PESTANAS = [['resumen', 'Resumen'], ['codigos', 'Códigos de prueba'], ['socios', 'Socios'], ['boletas', 'Boletas'], ['alertas', 'Alertas'], ['locales', 'Locales'], ['config', 'Configuración'], ['importar', 'Importar ventas'], ['cartel', 'Cartel QR'], ['auditoria', 'Auditoría']];

async function restaurarDemo() {
  const { el, cerrar } = modal(`<h2 style="margin-bottom:6px">Restaurar demostración</h2>
    <p class="muted peq" style="margin-bottom:12px">Deja todo como el primer día para empezar la presentación de cero:</p>
    <ul class="peq" style="margin:0 0 14px 18px;line-height:1.6"><li>Se borran <b>todos los socios</b>, boletas, canjes, alertas y auditoría.</li><li>Las reglas y los códigos de prueba vuelven a los originales.</li><li>Los locales vuelven a los de demostración (PIN <b>1234</b>).</li><li>Las personas que estén con la app abierta vuelven a la portada.</li></ul>
    <label class="campo"><span>Escribe RESTAURAR para confirmar</span><input id="rest-conf" type="text" autocomplete="off"></label><div id="rest-err"></div>
    <div class="fila"><button class="btn sec" id="rest-no">Cancelar</button><button class="btn peligro" id="rest-si" disabled>Restaurar todo</button></div>`);
  $('#rest-conf', el).addEventListener('input', (e) => { $('#rest-si', el).disabled = e.target.value.trim() !== 'RESTAURAR'; });
  $('#rest-no', el).addEventListener('click', cerrar);
  $('#rest-si', el).addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      const r = await api('POST', '/api/admin/restaurar', { confirmar: 'RESTAURAR' });
      cerrar();
      toast(`Demostración restaurada (${r.borrados.socios} socios borrados)`);
      pestana = 'resumen';
      marco();
    } catch (err) {
      $('#rest-err', el).innerHTML = `<div class="error">${esc(err.message)}</div>`;
      e.currentTarget.disabled = false;
    }
  });
}

function marco() {
  app.innerHTML = `<header class="cabecera no-imprimir"><img src="${LOGO}" alt=""><div class="tit"><b>Administración · Club del Rey</b><span>El Rey de las Micheladas</span></div><button class="btn chico peligro" id="restaurar" style="flex:0 0 auto;display:none">Restaurar demo</button><button class="btn chico sec" id="salir" style="flex:0 0 auto">Salir</button></header>
    <div class="tabs no-imprimir" id="tabs">${PESTANAS.map(([id, n]) => `<button data-t="${id}" class="${id === pestana ? 'sel' : ''}">${n}</button>`).join('')}</div><div id="vista"></div>`;
  $('#salir').addEventListener('click', async () => { await api('POST', '/api/admin/salir', {}); pagAdmin(); });
  api('GET', '/api/estado').then((e) => { if (e.demo || e.mvp) { const b = $('#restaurar'); b.style.display = ''; b.addEventListener('click', restaurarDemo); } }).catch(() => {});
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => { pestana = b.dataset.t; marco(); }));
  const vistas = { resumen, codigos, socios, boletas, alertas, locales, config, importar, cartel, auditoria };
  Promise.resolve(vistas[pestana]($('#vista'))).catch((e) => { $('#vista').innerHTML = `<div class="error">${esc(e.message)}</div>`; });
}

async function resumen(v) {
  const r = await api('GET', '/api/admin/resumen');
  const rangos = (await api('GET', '/api/rangos')).rangos;
  v.innerHTML = `<div class="metricas">
    <div class="metrica"><small>Socios</small><b>${r.socios}</b></div><div class="metrica"><small>Nuevos (7 días)</small><b>${r.nuevos_7d}</b></div>
    <div class="metrica"><small>Ventas (30 días)</small><b>${fmt(r.ventas_30d)}</b></div><div class="metrica"><small>Tasa de reclamo</small><b>${r.tasa_reclamo}%</b></div>
    <div class="metrica"><small>Coronas emitidas (30 d)</small><b>${fmt(r.coronas_emitidas_30d)}</b></div><div class="metrica"><small>Coronas canjeadas (30 d)</small><b>${fmt(r.coronas_canjeadas_30d)}</b></div>
    <div class="metrica"><small>Pasivo en coronas</small><b>${fmt(r.pasivo_coronas)}</b></div><div class="metrica"><small>Alertas abiertas</small><b>${r.alertas_abiertas}</b></div></div>
    <div class="panel-grid"><section class="card"><h3 style="margin-bottom:10px">Socios por rango</h3><div class="lista">${rangos.map((x) => `<div class="item">${medallaSVG(x.id, 36)}<span class="tx"><b>${esc(x.nombre)}</b></span><span class="monto">${r.por_rango[x.id] ?? 0}</span></div>`).join('')}</div></section>
    <section class="card"><h3 style="margin-bottom:10px">Locales (últimos 7 días)</h3><div class="scroll-x"><table><thead><tr><th>Local</th><th>Boletas</th><th>Ventas</th><th>Reclamadas</th></tr></thead><tbody>${r.locales.map((l) => `<tr><td>${esc(l.nombre)}</td><td>${l.boletas}</td><td>${fmt(l.ventas)}</td><td>${l.tasa}%</td></tr>`).join('')}</tbody></table></div></section></div>`;
}

async function socios(v) {
  v.innerHTML = `<div class="card"><div class="fila"><input id="q" type="text" placeholder="Buscar por nombre, teléfono o código"><button class="btn chico" id="b" style="flex:0 0 auto">Buscar</button><button class="btn chico sec" id="csv" style="flex:0 0 auto">Descargar coronas por código (CSV)</button></div><div id="lista" class="scroll-x" style="margin-top:12px"></div></div>`;
  const cargar = async () => {
    const r = await api('GET', `/api/admin/socios?q=${encodeURIComponent($('#q').value)}`);
    $('#lista').innerHTML = r.socios.length ? `<table><thead><tr><th>Socio</th><th>Código</th><th>Teléfono</th><th>Rango</th><th>Consumo 12 m</th><th>Coronas</th><th>Estado</th></tr></thead><tbody>${r.socios.map((s) => `<tr data-id="${s.id}" style="cursor:pointer"><td><b>${esc(s.nombre)}</b></td><td><b style="font-family:var(--display);letter-spacing:.08em;color:var(--y)">${esc(s.codigo_socio ? s.codigo_socio.slice(0, 3) + '-' + s.codigo_socio.slice(3) : '—')}</b></td><td>${esc(s.telefono || '')}</td><td>${esc(s.rango)}</td><td>${fmt(s.gasto)}</td><td>${fmt(s.coronas)}</td><td>${s.es_personal ? '<span class="etiqueta ambar">equipo</span> ' : ''}<span class="etiqueta ${s.estado === 'activo' ? 'verde' : 'rojo'}">${esc(s.estado)}</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Sin resultados.</p>';
    $$('#lista tr[data-id]').forEach((tr) => tr.addEventListener('click', () => detalle(Number(tr.dataset.id), cargar)));
  };
  $('#b').addEventListener('click', cargar);
  $('#csv').addEventListener('click', async () => {
    try {
      const r = await fetch('/api/admin/socios.csv', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('No se pudo descargar el archivo.');
      const url = URL.createObjectURL(await r.blob());
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = 'coronas-por-codigo.csv';
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { toast(e.message, 'err'); }
  });
  $('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') cargar(); });
  cargar();
}

async function detalle(id, recargar) {
  const d = await api('GET', `/api/admin/socios/${id}`);
  const s = d.socio;
  const { el, cerrar } = modal(`<h2>${esc(s.nombre)}</h2><p class="muted peq">${esc(s.telefono || '')} · nació ${esc(s.nacimiento)} · ${esc(d.rango.nombre)} · saldo ${fmt(d.saldo)}</p>
    <div class="fila" style="margin:12px 0"><button class="btn chico sec" id="est">${s.estado === 'bloqueado' ? 'Desbloquear' : 'Bloquear'}</button><button class="btn chico sec" id="per">${s.es_personal ? 'Quitar de equipo' : 'Marcar como equipo'}</button></div>
    <div class="fila"><input id="aj" type="number" step="1" placeholder="± coronas"><input id="nota" type="text" placeholder="Motivo del ajuste"><button class="btn chico" id="ajb" style="flex:0 0 auto">Ajustar</button></div>
    <h3 style="margin:14px 0 6px">Movimientos</h3><div class="scroll-x"><table><tbody>${d.movimientos.map((m) => `<tr><td>${esc(cuando(m.creado_en))}</td><td>${esc(m.tipo)}</td><td>${m.coronas >= 0 ? '+' : ''}${fmt(m.coronas)}</td><td class="muted">${esc(m.nota || '')}</td></tr>`).join('')}</tbody></table></div>
    <div class="sep"></div><button class="btn sec" id="x">Cerrar</button>`);
  $('#x', el).addEventListener('click', cerrar);
  const accion = async (fn, msg) => { try { await fn(); toast(msg); cerrar(); recargar(); } catch (e) { toast(e.message, 'err'); } };
  $('#est', el).addEventListener('click', () => accion(() => api('POST', `/api/admin/socios/${id}/estado`, { estado: s.estado === 'bloqueado' ? 'activo' : 'bloqueado' }), 'Estado actualizado'));
  $('#per', el).addEventListener('click', () => accion(() => api('POST', `/api/admin/socios/${id}/personal`, { es_personal: !s.es_personal }), 'Actualizado'));
  $('#ajb', el).addEventListener('click', () => accion(() => api('POST', `/api/admin/socios/${id}/ajuste`, { coronas: Number($('#aj', el).value), nota: $('#nota', el).value }), 'Ajuste aplicado'));
}

async function boletas(v) {
  const locs = (await api('GET', '/api/admin/locales')).locales;
  v.innerHTML = `<div class="card"><div class="fila"><select id="l"><option value="">Todos los locales</option>${locs.map((l) => `<option value="${esc(l.codigo)}">${esc(l.nombre)}</option>`).join('')}</select><select id="e"><option value="">Todos los estados</option><option>emitida</option><option>reclamada</option><option>anulada</option></select></div><div id="t" class="scroll-x" style="margin-top:12px"></div></div>`;
  const cargar = async () => {
    const r = await api('GET', `/api/admin/boletas?local=${encodeURIComponent($('#l').value)}&estado=${encodeURIComponent($('#e').value)}`);
    $('#t').innerHTML = `<table><thead><tr><th>Fecha</th><th>Local</th><th>Folio</th><th>Código</th><th>Total</th><th>Personas</th><th>Reclamada por</th><th>Estado</th></tr></thead><tbody>${r.boletas.map((b) => `<tr><td>${esc(cuando(b.emitida_en))}</td><td>${esc(b.local)}</td><td>${esc(b.folio)}</td><td>${esc(b.codigo)}</td><td>${fmt(b.monto)}</td><td>${b.personas ?? b.comensales ?? '—'}</td><td>${esc(b.pagador || '—')}</td><td><span class="etiqueta ${b.estado === 'reclamada' ? 'verde' : b.estado === 'anulada' ? 'rojo' : ''}">${esc(b.estado)}</span></td></tr>`).join('')}</tbody></table>`;
  };
  $('#l').addEventListener('change', cargar);
  $('#e').addEventListener('change', cargar);
  cargar();
}

async function alertas(v) {
  const r = await api('GET', '/api/admin/alertas');
  const NOMBRES = { personal_intento: 'Cuenta del equipo intentó sumar coronas', limite_diario: 'Llegó al límite diario de boletas', limite_semanal: 'Llegó al límite semanal de boletas', limite_partes: 'Llegó al límite diario de partes ajenas' };
  v.innerHTML = `<div class="panel-grid"><section class="card"><h3 style="margin-bottom:10px">Alertas abiertas</h3>${r.alertas.length ? `<div class="lista">${r.alertas.map((a) => `<div class="item"><span class="em">⚠️</span><span class="tx"><b>${esc(NOMBRES[a.tipo] || a.tipo)}</b><span>${esc(a.nombre || '')} · ${esc(cuando(a.creado_en))}</span></span><button class="btn chico sec" data-r="${a.id}">Resolver</button></div>`).join('')}</div>` : '<p class="muted">Sin alertas. 🎉</p>'}</section>
    <section class="card"><h3 style="margin-bottom:10px">Muchos reclamos en 24 horas</h3>${r.muchos_reclamos.length ? `<div class="lista">${r.muchos_reclamos.map((m) => `<div class="item"><span class="tx"><b>${esc(m.nombre)}</b><span>${m.n} boletas</span></span></div>`).join('')}</div>` : '<p class="muted">Nadie sobre el umbral.</p>'}</section></div>`;
  $$('[data-r]').forEach((b) => b.addEventListener('click', async () => { await api('POST', `/api/admin/alertas/${b.dataset.r}/resolver`, {}); alertas(v); }));
}

function credenciales(titulo, items) {
  const { el, cerrar } = modal(`<h2>${esc(titulo)}</h2><p class="aviso" style="margin:10px 0">Guárdalas ahora: no se vuelven a mostrar.</p>${items.map((i) => `<div style="margin-bottom:12px"><div class="muted peq">${esc(i.nombre)}</div><pre class="cod">PIN: ${esc(i.pin || '—')}\nLlave API: ${esc(i.api_key || '—')}</pre></div>`).join('')}<button class="btn" id="ok">Listo</button>`);
  $('#ok', el).addEventListener('click', cerrar);
}

async function locales(v) {
  const r = await api('GET', '/api/admin/locales');
  v.innerHTML = `<div class="panel-grid"><section class="card" style="grid-column:1/-1"><div class="fila" style="margin-bottom:10px"><h3>Locales</h3><button class="btn chico sec" id="ej" style="flex:0 0 auto">Cargar locales de ejemplo</button></div><div class="scroll-x"><table><thead><tr><th>Código</th><th>Nombre</th><th>Dirección</th><th>Estado</th><th></th></tr></thead><tbody>${r.locales.map((l) => `<tr><td>${esc(l.codigo)}</td><td>${esc(l.nombre)}</td><td>${esc(l.direccion || '')}</td><td><span class="etiqueta ${l.activo ? 'verde' : 'rojo'}">${l.activo ? 'activo' : 'inactivo'}</span></td><td style="white-space:nowrap"><button class="btn chico sec" data-pin="${l.id}">Nuevo PIN</button> <button class="btn chico sec" data-key="${l.id}">Nueva llave API</button> <button class="btn chico sec" data-act="${l.id}" data-v="${l.activo ? 0 : 1}">${l.activo ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('')}</tbody></table></div></section>
    <section class="card"><h3 style="margin-bottom:10px">Nuevo local</h3><label class="campo"><span>Código (ej. REY-XVI)</span><input id="nc" type="text"></label><label class="campo"><span>Nombre</span><input id="nn" type="text"></label><label class="campo"><span>Dirección</span><input id="nd" type="text"></label><button class="btn" id="crear">Crear local</button></section></div>`;
  $('#ej').addEventListener('click', async () => { const x = await api('POST', '/api/admin/locales/ejemplo', {}); if (x.creados.length) credenciales(`${x.creados.length} locales creados`, x.creados.map((c) => ({ nombre: c.nombre, pin: c.pin, api_key: c.api_key }))); else toast('Ya estaban cargados'); locales(v); });
  $('#crear').addEventListener('click', async () => {
    try { const x = await api('POST', '/api/admin/locales', { codigo: $('#nc').value, nombre: $('#nn').value, direccion: $('#nd').value }); credenciales('Local creado', [{ nombre: x.local.nombre, pin: x.local.pin, api_key: x.local.api_key }]); locales(v); } catch (e) { toast(e.message, 'err'); }
  });
  $$('[data-pin]').forEach((b) => b.addEventListener('click', async () => { const x = await api('POST', `/api/admin/locales/${b.dataset.pin}/pin`, {}); credenciales('Nuevo PIN', [{ nombre: 'Local ' + b.dataset.pin, pin: x.pin }]); }));
  $$('[data-key]').forEach((b) => b.addEventListener('click', async () => { if (!confirm('La llave anterior dejará de funcionar. ¿Continuar?')) return; const x = await api('POST', `/api/admin/locales/${b.dataset.key}/apikey`, {}); credenciales('Nueva llave de API', [{ nombre: 'Local ' + b.dataset.key, api_key: x.api_key }]); }));
  $$('[data-act]').forEach((b) => b.addEventListener('click', async () => { await api('POST', `/api/admin/locales/${b.dataset.act}`, { activo: b.dataset.v === '1' }); locales(v); }));
}

const CAMPOS = [
  ['tope_coronas_por_persona', 'Tope de coronas por persona y boleta ($)'], ['gasto_minimo_por_persona', 'Gasto mínimo por persona ($) · define el máximo de personas'],
  ['gasto_maximo_por_persona', 'Gasto máximo por persona ($) · define el mínimo de personas'], ['max_personas', 'Máximo de personas por boleta'],
  ['horas_activacion', 'Horas para activar las coronas'], ['ventana_reclamo_horas', 'Horas para ingresar el código de la boleta'], ['ventana_mesa_horas', 'Horas para que los amigos reclamen su parte'],
  ['reclamos_boleta_por_dia', 'Boletas por persona cada 24 h'], ['reclamos_boleta_por_semana', 'Boletas por persona cada 7 días'], ['partes_por_dia', 'Partes ajenas por persona cada 24 h'],
  ['canje_vigencia_min', 'Minutos de vida de la ficha de canje'], ['canje_gracia_seg', 'Tolerancia de la caja (segundos)'], ['canje_minimo', 'Canje mínimo ($)'], ['canje_maximo', 'Canje máximo ($)'],
  ['canje_multiplo', 'Canje en múltiplos de ($)'], ['canjes_por_dia', 'Canjes por día'], ['meses_inactividad_vence', 'Meses sin actividad para que venzan las coronas'],
  ['edad_minima', 'Edad mínima'], ['alerta_reclamos_24h', 'Alertar desde N boletas en 24 h'],
];

async function codigos(v) {
  const { mvp, codigos: lista } = await api('GET', '/api/admin/codigos');
  const fila = (c) => `<tr data-cod="${esc(c.codigo)}"><td><b style="font-family:var(--display);letter-spacing:.08em;font-size:18px;color:var(--y)">${esc(c.codigo)}</b></td>
    <td><input type="number" data-k="monto" value="${c.monto}" style="min-width:110px"></td><td><input type="number" data-k="personas" value="${c.personas}" style="width:80px"></td>
    <td><input type="text" data-k="nota" value="${esc(c.nota || '')}" style="min-width:220px"></td><td><input type="checkbox" data-k="activo" ${c.activo ? 'checked' : ''} style="width:22px;height:22px"></td>
    <td style="white-space:nowrap"><button class="btn chico" data-g>Guardar</button> <button class="btn chico peligro" data-b>Borrar</button></td></tr>`;
  v.innerHTML = `${mvp ? '' : '<div class="aviso">Estos códigos solo funcionan con <b>MODO_MVP = 1</b> (hoy está apagado). En producción no existen.</div>'}
    <section class="card"><h3 style="margin-bottom:4px">Códigos de prueba (modo demostración)</h3>
    <p class="muted peq" style="margin-bottom:12px">Reemplazan al código de la boleta durante la demo: se pueden usar todas las veces que se quiera, no vencen y cada uso crea una boleta nueva por ese monto. Con ellos el cliente sube de rango sin esperar. Cambia los montos y las personas como necesites.</p>
    <div class="scroll-x"><table><thead><tr><th>Código</th><th>Monto ($)</th><th>Personas</th><th>Descripción</th><th>Activo</th><th></th></tr></thead><tbody>${lista.map(fila).join('')}</tbody></table></div></section>
    <section class="card"><h3 style="margin-bottom:10px">Agregar o reemplazar un código</h3><div class="fila" style="flex-wrap:wrap;align-items:flex-end">
    <label class="campo" style="margin:0"><span>Código (3 a 12 letras o números)</span><input id="n-cod" type="text" maxlength="12" style="text-transform:uppercase"></label>
    <label class="campo" style="margin:0"><span>Monto ($)</span><input id="n-monto" type="number" value="100000"></label>
    <label class="campo" style="margin:0"><span>Personas</span><input id="n-pers" type="number" value="1"></label>
    <label class="campo" style="margin:0;flex:2"><span>Descripción</span><input id="n-nota" type="text" maxlength="120"></label>
    <button class="btn" id="n-ok" style="max-width:160px">Guardar</button></div><div id="err"></div></section>`;
  const enviar = async (cuerpo) => {
    try { await api('POST', '/api/admin/codigos', cuerpo); toast('Código guardado'); codigos(v); } catch (e) { $('#err').innerHTML = `<div class="error">${esc(e.message)}</div>`; toast(e.message, 'err'); }
  };
  $('#n-ok').addEventListener('click', () => enviar({ codigo: $('#n-cod').value, monto: Number($('#n-monto').value), personas: Number($('#n-pers').value), nota: $('#n-nota').value }));
  $$('tr[data-cod]').forEach((tr) => {
    const dato = (k) => tr.querySelector(`[data-k="${k}"]`);
    tr.querySelector('[data-g]').addEventListener('click', () => enviar({ codigo: tr.dataset.cod, monto: Number(dato('monto').value), personas: Number(dato('personas').value), nota: dato('nota').value, activo: dato('activo').checked }));
    tr.querySelector('[data-b]').addEventListener('click', async () => { await api('POST', '/api/admin/codigos/borrar', { codigo: tr.dataset.cod }); toast('Código borrado'); codigos(v); });
  });
}

async function config(v) {
  const { config: c } = await api('GET', '/api/admin/config');
  v.innerHTML = `<div class="panel-grid"><section class="card"><h3 style="margin-bottom:10px">Rangos</h3>${c.rangos.map((r, i) => `<div class="item" style="flex-wrap:wrap">${medallaSVG(r.id, 36)}<b style="width:110px">${esc(r.id)}</b><input data-r="${i}" data-k="nombre" value="${esc(r.nombre)}" style="flex:1;min-width:120px"><input data-r="${i}" data-k="desde" type="number" value="${r.desde}" ${i === 0 ? 'disabled' : ''} style="width:120px" title="Consumo desde"><input data-r="${i}" data-k="pct" type="number" value="${r.pct}" style="width:80px" title="% de vuelta"><input data-r="${i}" data-k="beneficio" value="${esc(r.beneficio)}" style="flex-basis:100%"></div>`).join('<div class="sep"></div>')}
    <p class="muted peq" style="margin-top:8px">Columnas: nombre · consumo desde ($) · % de vuelta en coronas · descripción.</p></section>
    <section class="card"><h3 style="margin-bottom:10px">Reglas</h3>${CAMPOS.map(([k, n]) => `<label class="campo"><span>${esc(n)}</span><input data-c="${k}" type="number" value="${c[k]}"></label>`).join('')}
    <h3 style="margin:14px 0 8px">Regalo de cumpleaños</h3><label class="check"><input type="checkbox" id="rg-activo" ${c.regalo.activo ? 'checked' : ''}><span>Activo</span></label>
    <label class="campo"><span>Descripción</span><input id="rg-desc" type="text" value="${esc(c.regalo.descripcion)}"></label>
    ${[['dias_antes', 'Días antes del cumpleaños'], ['dias_despues', 'Días después'], ['dias_registro_minimos', 'Antigüedad mínima (días)'], ['boletas_minimas', 'Visitas mínimas (días distintos)']].map(([k, n]) => `<label class="campo"><span>${n}</span><input data-g="${k}" type="number" value="${c.regalo[k]}"></label>`).join('')}</section></div>
    <div id="err"></div><button class="btn" id="guardar" style="max-width:360px">Guardar configuración</button>`;
  $('#guardar').addEventListener('click', async () => {
    const nuevo = JSON.parse(JSON.stringify(c));
    $$('[data-c]').forEach((i) => { nuevo[i.dataset.c] = Number(i.value); });
    $$('[data-g]').forEach((i) => { nuevo.regalo[i.dataset.g] = Number(i.value); });
    nuevo.regalo.activo = $('#rg-activo').checked;
    nuevo.regalo.descripcion = $('#rg-desc').value;
    $$('[data-r]').forEach((i) => { const r = nuevo.rangos[Number(i.dataset.r)]; r[i.dataset.k] = ['desde', 'pct'].includes(i.dataset.k) ? Number(i.value) : i.value; });
    try { await api('POST', '/api/admin/config', { config: nuevo }); $('#err').innerHTML = ''; toast('Configuración guardada'); } catch (e) { $('#err').innerHTML = `<div class="error">${esc((e.datos?.errores || [e.message]).join(' · '))}</div>`; }
  });
}

function importar(v) {
  const ejemplo = 'Local;Folio;Monto;Fecha;Comensales\nREY-X;1001;$150.000;08/10/2026 20:30;5\nREY-IV;1002;28.500;08/10/2026 21:00;';
  v.innerHTML = `<div class="card"><h3 style="margin-bottom:6px">Importar ventas desde Excel</h3><p class="muted peq" style="margin-bottom:10px">Copia las filas de tu Excel (con títulos) y pégalas aquí, o guarda como CSV. Columnas: Local, Folio, Monto, y opcionalmente Fecha, Comensales, Codigo. Las boletas ya cargadas se ignoran.</p>
    <textarea id="csv" rows="9" placeholder="${esc(ejemplo)}"></textarea><div class="fila" style="margin-top:10px"><button class="btn sec" id="ej">Cargar ejemplo</button><button class="btn" id="imp">Importar</button></div><div id="res" style="margin-top:12px"></div></div>`;
  $('#ej').addEventListener('click', () => { $('#csv').value = ejemplo; });
  $('#imp').addEventListener('click', async () => {
    // Se envía en tandas de 10 filas: Cloudflare limita las consultas por solicitud.
    const lineas = $('#csv').value.split(/\r?\n/).filter((l) => l.trim() !== '');
    const total = { creadas: 0, repetidas: 0, errores: [] };
    const boton = $('#imp');
    boton.disabled = true;
    try {
      if (lineas.length < 2) throw new Error('Pega los títulos y al menos una boleta.');
      for (let i = 1; i < lineas.length; i += 10) {
        $('#res').innerHTML = `<div class="muted">Importando… ${Math.min(i + 9, lineas.length - 1)} de ${lineas.length - 1}</div>`;
        const r = await api('POST', '/api/admin/importar', { csv: [lineas[0], ...lineas.slice(i, i + 10)].join('\n') });
        total.creadas += r.creadas;
        total.repetidas += r.repetidas;
        // la fila 2 de cada tanda corresponde a la línea i + 1 del texto pegado
        r.errores.forEach((e) => total.errores.push({ fila: e.fila - 2 + i + 1, motivo: e.motivo }));
      }
      $('#res').innerHTML = `<div class="card ok" style="margin:0"><b>${total.creadas} boletas nuevas</b> · ${total.repetidas} ya existían · ${total.errores.length} con error</div>${total.errores.length ? `<pre class="cod">${esc(total.errores.map((e) => `Fila ${e.fila}: ${e.motivo}`).join('\n'))}</pre>` : ''}`;
    } catch (e) { $('#res').innerHTML = `<div class="error">${esc(e.message)}</div>`; } finally { boton.disabled = false; }
  });
}

function cartel(v) {
  const url = location.origin + '/';
  v.innerHTML = `<div class="card no-imprimir"><h3 style="margin-bottom:8px">Cartel con QR</h3><p class="muted peq" style="margin-bottom:10px">Pon este QR en la carta digital y en las mesas. Dirección del Club:</p><input id="u" type="text" value="${esc(url)}"><div class="sep"></div><button class="btn" id="imp">Imprimir cartel</button></div>
    <div class="card cartel" id="cart" style="display:block;background:#fff;color:#1b1204;text-align:center"><img src="${LOGO}" alt="" style="width:120px;height:120px;border-radius:50%;border:5px solid #f7b22a"><h1 style="margin:10px 0">Únete al Club del Rey 👑</h1><p style="font-size:18px">Sube de rango en cada visita.<br>Escanea y empieza a sumar coronas.</p><div class="qrbox" id="q" style="box-shadow:none"></div><p style="font-weight:800;margin-top:6px">${esc(url.replace(/^https?:\/\//, ''))}</p><p style="font-size:12px;margin-top:8px">Solo mayores de 18 años · Consume responsablemente</p></div>`;
  const pintarQR = () => { $('#q').innerHTML = qrSvg($('#u').value, 260); $('#cart p:last-of-type')?.previousElementSibling; };
  $('#u').addEventListener('input', pintarQR);
  pintarQR();
  $('#imp').addEventListener('click', () => print());
}

async function auditoria(v) {
  const r = await api('GET', '/api/admin/auditoria');
  v.innerHTML = `<div class="card scroll-x"><table><thead><tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>${r.auditoria.map((a) => `<tr><td>${esc(cuando(a.creado_en))}</td><td>${esc(a.actor)}</td><td>${esc(a.accion)}</td><td class="muted peq">${esc(a.detalle ? JSON.stringify(a.detalle) : '')}</td></tr>`).join('')}</tbody></table></div>`;
}
