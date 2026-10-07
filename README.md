# Club del Rey

App web de fidelización de El Rey de las Micheladas: cartas por local, cuentas con Supabase, amigos por QR/código, coronas compartidas, notificaciones de actividad y canjes. **1 corona = $1 CLP de descuento.**

La nueva web está en la raíz y se despliega en **Vercel**. El proyecto original del ZIP permanece en `original/club-app/`; su API Cloudflare/SQLite y su base no están conectadas a la nueva versión. No existen dos saldos sincronizados: la versión nueva usa exclusivamente PostgreSQL de Supabase.

## Desarrollo

Requiere Node **22.13+** (validado con Node 24).

```sh
npm ci
cp .env.example .env.local
# Completa URL del proyecto y clave pública de Supabase.
npm run dev
npm run build
npm test
npm run test:original
```

Sin variables de Supabase, se puede ver la portada y la carta oficial; las cuentas están deshabilitadas y no se simulan saldos. No hay cuentas ni coronas de demostración en producción.

## Conectar las cuentas y publicar

Sigue [la guía de Supabase y Vercel](docs/CONEXION-SUPABASE-VERCEL.md). Incluye la migración, confirmación de correo, recuperación, primer administrador, cartas de locales y permisos de caja.

- `VITE_SUPABASE_URL`: URL del proyecto.
- `VITE_SUPABASE_ANON_KEY`: clave **publishable** o `anon` (pública; protegida por RLS).
- Las claves **secret/service_role** y llaves de caja jamás llevan prefijo `VITE_`, nunca van en Git y no se envían al navegador.

## Probar con Martín y Luis

[Guía de carga SQL, cinco boletas y recorrido completo](docs/PRUEBA-MARTIN-LUIS.md). Incluye una boleta de $60.000, 5.000 coronas para Martín y 3.000 para Luis, sin duplicar al repetir. Requiere cuentas existentes y activar la prueba desde administración; instalar el código no modifica saldos por sí solo.

## Qué incluye esta versión

- Registro con nombre, apellido, RUT con dígito verificador, celular chileno, cumpleaños, correo, contraseña y aceptación de términos. Acceso para mayores de 18 años.
- Inicio de sesión por correo/contraseña, confirmación de correo, sesión persistente, recuperación y cierre de sesión.
- Selector por comuna, orden opcional por cercanía (GPS solo en el navegador), carta externa por local.
- Invitación por código/QR, lectura QR cuando el navegador soporta `BarcodeDetector`, solicitudes y aceptación de amistad.
- Envíos entre amigos aceptados, con saldo disponible, idempotencia, bloqueos de filas y libro de movimientos. Tope 20.000 por envío / 50.000 por día.
- Avisos **al abrir la carta**, con consentimiento para compartir actividad. Silencio independiente por amigo. Antispam: al menos 15 minutos entre avisos y dos horas para repetir el mismo local.
- Notificaciones **dentro de la app**, vía Supabase Realtime y consulta periódica de respaldo. No son push con la app cerrada ni mensajes de WhatsApp.
- Rangos del prototipo: Plebeyo, Comerciante, Guardia Real, Noble y Rey. Porcentajes 4/6/8/10/12 según consumo de 12 meses; las transferencias no aumentan el rango.
- Código de socio para caja. Boletas idempotentes, acreditación por persona, espera de 24 horas y tope de 8.000 coronas por persona/boleta.
- Ficha de descuento de 10 minutos, reserva y devolución al cancelar/vencer. Hasta 20.000, mínimo 1.000, múltiplos de 500 y un canje diario.
- Panel `/admin`: resumen, socios recientes, mantenimiento de locales/cartas verificadas y acreditaciones manuales de coronas con motivo e historial. Solo administradores, hasta 20.000 por carga, saldo inmediato sin aumentar rango. Requiere la migración `202610070002_admin_credits.sql`.
- Panel `/caja`: consulta de socios, aplicación de fichas, registro y anulación de boletas. Solo cuentas con permiso, limitado al local correspondiente.
- Pantalla `/coronas`: saldo, ingreso del código de boleta, uso de descuentos y envío a amigos, en ese orden vertical. El formulario usa las boletas del piloto; los códigos de compras reales aún requieren integración.
- Pantalla `/pruebas`: piloto autorizado por administrador para dos cuentas, cinco boletas ficticias de un uso, local virtual restringido, coronas pendientes 24 horas desde el canje del código y cierre con auditoría conservada.
- API `/api/pos` para integración externa, con llave independiente por local y credenciales guardadas en el servidor.

## Estado y límites concretos

El enlace `https://qrfy.io/p/oOBx-dlqTy` devolvió un bloqueo de red durante el desarrollo. Se conserva como carta oficial, pero **no se inventaron cinco locales ni enlaces de cartas**. El selector se completa desde `/admin` con datos reales y verificados.

El código y la migración están preparados; se requiere aplicar la migración a un proyecto Supabase y probar el correo, las cuentas, Realtime y los canjes allí. El build de Vercel necesita las dos variables públicas configuradas antes de compilar.

Los beneficios de cumpleaños, reclamos tardíos por enlace de mesa, importación CSV, vencimiento por inactividad y edición de reglas del panel original se conservan en `original/club-app/`, pero **todavía no están migrados al backend Supabase**. El cumpleaños ya se captura en el registro. Las reglas de negocio de la versión nueva están en la migración y deben aprobarse comercialmente antes de un piloto.

Los términos son una base de trabajo: completar responsable/contacto de datos, conservación, revisión legal y derechos antes de aceptar clientes reales. Confirmar derechos sobre fotos y marca suministradas en el ZIP.

## Validación

```sh
npm test                  # pruebas SQL sobre PostgreSQL/PGlite y validaciones de dominio
npm run test:original     # suite del proyecto recibido
npm run test:e2e          # Chromium: UI móvil/escritorio con HTTP de Supabase simulado
npm run build
```

El e2e usa `/usr/bin/chromium` por defecto. En otra máquina: instala Chromium con Playwright y define `CHROMIUM_EXECUTABLE` con su ruta (o instala Chromium del sistema). No usa cuentas reales, y no demuestra envío de correo ni conexión con un Supabase remoto. Las pruebas SQL ejecutan la migración y las funciones reales, con un esquema de Auth mínimo para los usuarios de prueba; no comprueban concurrencia entre conexiones PostgreSQL reales. Capturas de pruebas en `test/artifacts/` (ignoradas por Git).

## Estructura

```
src/                  Web Vite, cliente Supabase, pantallas y validaciones
public/               Marca, fotos, fuentes y manifest
supabase/migrations/  Tablas, RLS, funciones de saldo, amistades, notificaciones y caja
api/pos.js            Función de servidor Vercel para la caja externa
vercel.json           Build, rutas y cabeceras
original/club-app/    Proyecto completo recibido, preservado
docs/                 Conexión, API de caja y contexto original
test/                 Pruebas de la versión nueva
```
