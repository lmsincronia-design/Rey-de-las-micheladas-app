# Club del Rey · app de fidelización de El Rey de las Micheladas

App web instalable (PWA) en español de Chile. El cliente entra por el QR de la carta, se une con su celular, **sube de rango según lo que consume** (Plebeyo → Comerciante → Guardia → Noble → Rey) y junta **coronas** que canjea como descuento.

Construida para Cloudflare (Worker + base D1 + archivos estáticos) y probada también con SQLite local.

## Cómo funciona (resumen)

1. **Unirse:** celular + código de verificación (por WhatsApp) + nombre + cumpleaños (mayores de 18) + aceptar términos. Cada socio recibe un **código personal** (ej. `KRW-GMQ`, con QR) en la pestaña "Mi código".
2. **Antes de pedir la cuenta:** el cliente le dice su código al garzón. La caja lo escribe y ve su nombre, rango y **coronas al día**; descuenta las que el cliente quiera usar. El descuento queda en el total **antes de emitir la boleta** ([INTEGRACION-CAJA.md](INTEGRACION-CAJA.md)).
3. **Al pagar:** la caja emite la boleta y la envía al Club con los códigos de los socios de la mesa. La cuenta se reparte en **partes iguales** y cada socio recibe coronas por *su* parte según *su* rango, sin ingresar nada. Su pantalla "Mi código" lo muestra al instante.
4. **Quien no dio su código:** puede ingresar el código impreso de la boleta en la app, o reclamar su parte con el **enlace de la mesa** (se abre en la app, 48 horas).
5. **Esperar:** las coronas se **activan 24 horas después** (en producción; en modo MVP al instante).
6. **Canje alternativo:** el cliente puede generar una **ficha** (10 minutos) y el garzón tocar **"Confirmar canje"** con el PIN del local.
7. **Cumpleaños:** regalo (por defecto, una michelada gratis) para quien lleva 30 días y 2 visitas; la caja lo entrega pidiendo la cédula.

Valores por defecto (todos editables en `/admin` → Configuración): 8/10/12/14/16 % de vuelta por rango, rangos desde $0/$50.000/$150.000/$350.000/$700.000 de consumo en 12 meses, tope $8.000 en coronas por persona y boleta, máx. 3 boletas por día y 8 por semana, 1 canje por día entre $1.000 y $20.000, coronas vencen a los 12 meses sin movimientos.

## Restaurar la demostración

En `/admin` (solo en modo demostración) hay un botón **Restaurar demo**: borra socios, boletas y canjes, y deja reglas, códigos de prueba y locales (PIN `1234`) como el primer día. Pide escribir RESTAURAR. En producción el botón y la ruta no existen.

## Modo MVP (para mostrar el sistema en vivo)

Con `MODO_MVP=1` (viene encendido en `npm run dev` y en `wrangler.jsonc`) la app se puede probar completa sin esperas:

* **Códigos de prueba fijos** (`/admin` → *Códigos de prueba*): `MESA5K` ($150.000, 5 personas), `PAREJA`, `SUMA10`, y `RANGO1`…`RANGO4` que sumados suben a Comerciante, Guardia, Noble y Rey. Se usan todas las veces que se quiera, no vencen y cada uso crea una boleta nueva. Se agregan, cambian o borran desde el panel.
* **Sin la espera de 24 h**: las coronas quedan disponibles al instante, sin topes diarios, y el regalo de cumpleaños no exige antigüedad. La app muestra una nota "versión de demostración" que explica cómo funciona el formato real. Son reglas editables en *Configuración*.
* En producción: `MODO_MVP="0"` (y `MODO_DEMO="0"`). Los códigos de prueba dejan de existir y rigen las reglas reales (24 h, topes).

Los enlaces de mesa tienen vista previa en WhatsApp (nombre de quien pagó, local, parte e imagen del Club): la escribe el Worker (`src/lib/og.js`), por eso `wrangler.jsonc` ejecuta el Worker primero en `/` y `/m/*`.

Cada persona recibe coronas según **su propio rango** sobre **su parte** de la cuenta, aunque compartan boleta.

## Pantallas

| Ruta | Quién | Qué |
|---|---|---|
| `/` `/entrar` `/boleta` `/canjear` `/rangos` `/historial` `/perfil` `/terminos` | Socio | La app |
| `/m/<token>` | Socio / amigo | Mesa compartida (enlace y QR) |
| `/caja` | Cajero | PIN por local: validar fichas, anular boletas, (demo) emitir boletas de prueba |
| `/admin` | Administración | Resumen, socios, boletas, alertas, locales, configuración, importar Excel, cartel QR, auditoría |

## Probarla en tu computador

```bash
npm install                 # solo para las herramientas de desarrollo (wrangler)
npm run dev                 # http://localhost:8787  (base en data/dev.sqlite)
```
* Caja: `/caja` → local REY-X, PIN `1234`. Admin: `/admin` → clave `rey-admin`.
* En modo demostración el código de verificación aparece en pantalla (botón "Usarlo").

```bash
npm test                    # 84 pruebas de la lógica (API, límites, carreras, privacidad)
npm run e2e                 # (reglas de producción) recorre las pantallas en un navegador real y deja capturas en test/capturas/
npx wrangler d1 migrations apply club-del-rey --local
npx wrangler dev --local --port 8801 &  node test/worker-smoke.mjs     # lo mismo, sobre el Worker real + D1 local
```

## Publicar en Cloudflare

Requiere tu cuenta de Cloudflare (el sitio de LM Sincronía ya usa una).

```bash
npx wrangler login
npx wrangler d1 create club-del-rey                     # copia el database_id en wrangler.jsonc
npx wrangler d1 migrations apply club-del-rey --remote
npx wrangler secret put SECRET                          # texto largo al azar (firma de códigos, PIN y teléfonos)
npx wrangler secret put ADMIN_PASSWORD                  # clave del panel /admin
npx wrangler deploy
```
Después: entrar a `/admin` → Locales → "Cargar locales de ejemplo" (muestra PIN y llave de API de cada uno **una sola vez**), y apuntar el dominio que quieras (ej. `club.reydelasmicheladas.cl`).

### Antes de abrirla a clientes reales

* **`MODO_DEMO`** en `wrangler.jsonc` debe pasar a `"0"`. En demostración el código de verificación se muestra en pantalla (cualquiera podría registrar números ajenos) y la caja puede emitir boletas de prueba. Solo sirve para mostrar el sistema.
* Con `MODO_DEMO=0` el código se envía por **WhatsApp Business (plantilla de autenticación aprobada por Meta)**. Configurar los secretos `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` y `WHATSAPP_OTP_TEMPLATE`. *El envío está programado pero no se ha probado contra Meta.* Alternativa: cambiar `enviarCodigo()` en `src/auth.js` por un proveedor de SMS.
* Revisar con el abogado los **términos** (`/terminos` es un resumen), la promoción de alcohol y la **Ley 21.719** (consentimiento explícito; vigente desde el 1-dic-2026).
* Conectar la caja o cargar ventas por Excel ([INTEGRACION-CAJA.md](INTEGRACION-CAJA.md)).
* Poner el QR del Club en la carta (`/admin` → Cartel QR genera uno imprimible).

## Seguridad en breve

Sesiones en cookie HttpOnly/SameSite; solo JSON (anti-CSRF) y verificación de origen; límites de intentos en códigos, PIN y adivinanza de boletas; teléfonos de amigos solo como huella HMAC; fichas de un solo uso con vencimiento y reserva de coronas; un solo canje por ficha y una sola reclamación por boleta (garantizado por la base, probado con solicitudes en paralelo); reversa automática si se anula una boleta; alertas y auditoría para el administrador; derechos de acceso y eliminación para el socio.

## Estructura

```
src/app.js         rutas de la API        src/cliente.js  socio: perfil, reclamo, mesas, canjes, regalo
src/auth.js        sesiones y verificación src/caja.js     boletas y fichas desde la caja
src/admin.js       panel e importación     src/lib/        reglas (config.js), saldo (club.js), utilidades
src/db-node.js     SQLite (dev/pruebas)    src/db-d1.js    Cloudflare D1        migrations/0001_init.sql
public/            la app (HTML/CSS/JS sin dependencias; QR con qrcode-generator, MIT)
test/              pruebas de la API, e2e en navegador y prueba contra el Worker real
```

## Límites conocidos

* Las consultas a D1 por solicitud están por debajo de 40 (el plan gratis permite 50); la importación se envía en tandas de 10 filas.
* El envío del código por WhatsApp (Meta) y la integración con la caja real dependen de cuentas y sistemas del cliente: no se pueden probar sin ellos.
* No hay aviso automático de cumpleaños por WhatsApp (haría falta una plantilla de marketing aprobada y el consentimiento del cliente); hoy el regalo aparece dentro de la app.
