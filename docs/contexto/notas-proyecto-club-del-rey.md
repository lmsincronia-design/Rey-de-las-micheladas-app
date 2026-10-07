# Notas del proyecto: Club del Rey (decisiones y estado)

App construida el 2026-10-06 en `demos/rey-de-las-micheladas/club-app/` a pedido de Martín (idea de él y Luis; reunión con el dueño y TI el jueves 2026-10-08 16:00). Ver [[prospecto-rey-de-las-micheladas]].

**Decisiones de Martín:** rangos Plebeyo → Comerciante → Guardia → Noble → Rey (5); las coronas de una visita NO se pueden canjear esa misma visita (se activan a las 24 h, para que vuelva); el enlace de la mesa abre la APP (no WhatsApp) y se comparte por WhatsApp (`wa.me`); el descuento se aplica ANTES de que caja emita la boleta (si no, no cuadra la caja).

**Qué es:** PWA vanilla + Cloudflare Worker + D1 (también SQLite en dev). Cliente entra por el QR de la carta → verifica celular (código por WhatsApp; en demo aparece en pantalla) → ingresa el código de 6 caracteres impreso en la boleta + cuántas personas → cuenta repartida en partes iguales; cada amigo reclama su parte con el enlace/QR de la mesa (48 h) o queda asignada por teléfono (HMAC). Rango por consumo 12 m; coronas = % por rango (8/10/12/14/16) con tope $8.000/persona/boleta. Canje: ficha de 10 min que valida `/caja` (PIN por local) o la API (llave por local). `/admin`: resumen, socios, boletas, alertas, locales, configuración editable, importar Excel/CSV, cartel QR, auditoría. Regalo de cumpleaños (michelada gratis) con cédula.

**Arquitectura clave:** la caja solo ENVÍA copia de la boleta (`POST /api/caja/boletas`, idempotente); la app nunca consulta la caja en vivo → si un local falla solo esperan sus boletas. Libro de movimientos (coronas pendientes/disponibles), reservas al canjear, reversa si se anula la boleta. Doc para TI: `INTEGRACION-CAJA.md`.

**Pruebas hechas (todas OK):** 84 tests de API (`npm test`, incluye carreras en paralelo), e2e en navegador con 42 capturas (`npm run e2e`), y prueba de humo contra el Worker REAL en wrangler local con D1 (`test/worker-smoke.mjs`). Ninguna solicitud usa >40 consultas D1 (plan gratis: 50). Se corrigieron bugs reales durante las pruebas (currentTarget nulo, rate limit que contaba errores de formato, clobber de `codigo` en errores, LIKE con comodines).

**Estado:** NO publicada (hace falta cuenta Cloudflare: `wrangler d1 create`, secrets SECRET y ADMIN_PASSWORD, `wrangler deploy`; pasos en README). `MODO_DEMO=1` muestra el OTP en pantalla y habilita boletas de prueba: solo para demostrar, nunca con clientes reales. Para producción falta: probar el envío del OTP por WhatsApp (Meta), conectar la caja real, revisar términos con abogado y Ley 21.719, y poner el QR en la carta. Correr local: doble clic a `iniciar-club.bat` (caja REY-X PIN 1234, admin clave `rey-admin`).

## Actualización 6-oct-2026 (modo MVP + rediseño)
- `MODO_MVP=1`: códigos de prueba fijos reutilizables (tabla `codigos_prueba`, editables en /admin → Códigos de prueba: MESA5K, PAREJA, SUMA10, RANGO1-4 para subir hasta Rey), coronas sin espera de 24 h, sin topes diarios. Producción = MODO_MVP "0". Lo pidió Martín para mostrar todo habilitado el jueves a TI.
- Cada persona gana según SU rango sobre SU parte (MESA5K: plebeyo 2.400, noble 4.200); respuesta dada a Martín.
- Rediseño con paleta del logo (negro + limones, ámbar, naranja), fuentes Anton/Jakarta autoalojadas, tarjeta de socio, íconos SVG, fotos de micheladas en portada. Pruebas: 88 unit + e2e + e2e:mvp.

## Actualización 6-oct-2026 (tarde)
- Botón "Confirmar canje" en la ficha: el garzón la aplica en el celular del cliente con el PIN del local (POST /api/canjes/confirmar, límites propios que no bloquean /caja). Demo: REY X, PIN 1234.
- Medallas nuevas (jarro con limón y adorno por rango, `public/js/medallas.js`), moneda de corona (`moneda.js`), limón realista (`assets/limon.svg`), espuma y burbujas, fotos reales de micheladas. Vista previa de enlaces de mesa en WhatsApp (`src/lib/og.js`, Worker con run_worker_first en / y /m/*).
- Pruebas: 94 unitarias, e2e producción, e2e:mvp (rangos mezclados, enlaces, vencimiento, confirmar), Worker+D1 smoke. Martín dejó un mensaje cortado ("De paso,") que quedó pendiente de preguntar.

## Actualización 6-oct-2026 (noche): código personal + restaurar
- Cada socio tiene `codigo_socio` (migración 0003, QR en /codigo). Caja lo consulta ANTES de emitir: GET /api/caja/socios/:codigo (coronas al día), POST .../canje (descuento al tiro), .../regalo, y POST /api/caja/boletas con `socios:[códigos]` (acredita por rango de cada uno, máx 8; el 1º paga). Listado sincronizable GET /api/caja/socios + CSV en admin. Boleta/enlace de mesa quedan como alternativa.
- Botón "Restaurar demo" en /admin (POST /api/admin/restaurar, solo MODO_DEMO/MVP, pide escribir RESTAURAR): borra todo y re-siembra locales demo (PIN 1234) y códigos de prueba.
- Riesgo conocido avisado a Martín: un garzón con el código podría descontar coronas; mitigación y opción de aprobación en el celular del cliente (no implementada).
