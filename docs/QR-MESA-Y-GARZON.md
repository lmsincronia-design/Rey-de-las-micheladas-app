# QR de la mesa y app del garzón (oct-2026)

Reemplaza a los enlaces para repartir la mesa y a las fichas de descuento reservadas. Requiere la migración
[`202610270001_qr_mesa_y_garzon.sql`](../supabase/migrations/202610270001_qr_mesa_y_garzon.sql).

## Reglas (propuesta de oct-2026 con las correcciones de Martín)

- **1 corona = $1.**
- **Sumar:** cada persona suma **su parte de la cuenta × el % de su propio rango**: Plebeyo 4%, Comerciante 6%, Guardia Real 8%, Noble 10%, Rey 12%. No hay tabla de tramos ni multiplicadores.
- **Mínimo $5.000 por persona.** Tope de 8.000 coronas por persona y cuenta. Máximo 3 cuentas por socio al día.
- **Canje:** igual para todos los rangos. De $1.000 a $20.000 en tramos de $500, un canje al día, en cualquier local.
- Las coronas de una compra quedan **por activar 24 horas**.
- No hay recordatorio a los 5 días sin visitas.

| $90.000 entre 3 personas | Parte | % | Coronas |
|---|---:|---:|---:|
| Plebeyo | $30.000 | 4% | 1.200 |
| Comerciante | $30.000 | 6% | 1.800 |
| Rey | $30.000 | 12% | 3.600 |

## Recorrido en la mesa

1. Mientras la mesa pide, el garzón pregunta quién usará coronas. Quien no tiene la app la instala y se registra (nombre, apellido, correo y fecha de nacimiento; **sin RUT**; celular opcional).
2. **Canje (antes de la cuenta):** el socio elige el monto en *Coronas → Usar* y muestra su QR. El QR cambia cada 30 segundos (una captura no sirve). El garzón lo escanea en *Escanear*: las coronas se descuentan en ese momento y el garzón informa el monto a caja antes de emitir la boleta.
3. **Sumar (al pagar):** en *Cobrar*, el garzón ingresa el total pagado (después del descuento), **cuántas personas van a sumar coronas** (no el total de la mesa; decisión de Martín, 27-10-2026) y, si quiere, el número de mesa. La cuenta se divide en partes iguales entre ellas. La app muestra la parte por persona y genera un QR que dura **10 minutos**.
4. Cada socio escanea el QR (con la cámara del teléfono o dentro de la app, en *Coronas → Sumar*), ve el monto y su parte, y toca **Sumar mis coronas**. Una vez por persona; las partes que nadie escanea se pierden. Si el QR vence, el garzón puede renovarlo (cambia el código) durante las primeras 3 horas.
5. **Cumpleaños:** el día de su cumpleaños el socio ve su QR de regalo. El garzón lo escanea, revisa la cédula y marca la casilla antes de entregar la michelada (también sin alcohol). Una vez al año.

## App del garzón: `/garzon`

Misma dirección de la app del Club, en `/garzon` (se instala aparte en el teléfono: tiene su propio ícono y nombre "Garzón Rey").

- **Clave del local:** se pide una vez por teléfono (dura 30 días). La crea el administrador en `/admin → App del garzón`. Cambiarla cierra la sesión en todos los teléfonos del local. Cinco claves malas bloquean 15 minutos.
- **PIN personal:** cada persona elige su nombre y entra con su PIN de 4 a 6 números (12 horas). Cinco PIN malos bloquean 10 minutos. Todo lo que hace queda registrado a su nombre (`local_audit`).
- **Cobrar:** QR de la mesa y avance en vivo ("2 de 3 ya sumaron").
- **Escanear:** canjes y cumpleaños, con cámara o escribiendo el código.
- **Hoy:** cuentas, canjes y cumpleaños del día para cuadrar con la caja.
- **Encargado:** además anula una cuenta mal ingresada (hasta 24 horas, revierte las coronas de todos) o un canje que no se aplicó en caja (hasta 2 horas, devuelve las coronas), siempre con motivo. En *Equipo* agrega garzones, cambia PIN y desactiva. Los encargados los crea el administrador.

La app del garzón **no muestra saldos ni datos personales**: solo nombre e inicial del socio en los canjes, y el nombre completo con la fecha de nacimiento en el cumpleaños, para compararlos con la cédula.

## Seguridad

- La app del garzón no usa cuentas del Club: llama funciones de la base con la clave pública y dos fichas (del teléfono y del garzón) que el servidor valida en cada operación. Las fichas se guardan cifradas (hash), nunca en texto.
- Las tablas nuevas no se pueden leer ni escribir desde el navegador; todo pasa por funciones con permisos acotados.
- Las funciones antiguas de enlaces (`prepare_table`, `claim_table_share`, `table_share_info`) y de fichas reservadas (`create_redemption`) quedan desactivadas para los socios. El historial se conserva.

## Pruebas

- `test/garzon.test.js`: las reglas sobre PostgreSQL real (PGlite): partes y %, mínimo, cupos, vencimiento y renovación, 3 cuentas al día, canje con QR, anulaciones, cumpleaños, PIN y bloqueos.
- `test/browser-garzon.mjs` y `test/browser.mjs`: las dos apps en Chromium móvil con la frontera HTTP de Supabase simulada.

No se probó con la cámara de un teléfono real ni con la base de producción (ver el estado en el chat del 27-10-2026).
