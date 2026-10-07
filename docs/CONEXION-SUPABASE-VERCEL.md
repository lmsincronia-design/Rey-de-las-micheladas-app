# Conectar Club del Rey con tus cuentas

Orden recomendado: proyecto Supabase → migración → variables de Vercel → deploy → redirecciones de Auth → probar dos cuentas → cargar cinco cartas → conectar caja. No necesitas copiar contraseñas ni claves privadas al chat o a Git.

## 1. Supabase

Crea un proyecto dedicado al Club (o usa uno nuevo sin tablas de otro producto). Guarda la contraseña de la base en tu gestor de contraseñas.

En **SQL Editor**, ejecuta completos, en este orden:

1. `supabase/migrations/202610070001_club.sql`
2. `supabase/migrations/202610070002_admin_credits.sql`
3. `supabase/migrations/202610070003_tier_rates.sql`
4. `supabase/migrations/202610070004_test_pilot.sql`

Si ya aplicaste la primera migración, ejecuta **solo las pendientes, desde la segunda**. Incluyen acreditaciones manuales, nuevos porcentajes y boletas ficticias de prueba.

Es una migración inicial que se aplica **una vez**, no un script para volver a ejecutar sobre tablas existentes. Incluye trigger de registro, wallets, ledger, amistades, notificaciones, locales, fichas y permisos. Un registro con RUT/edad inválidos falla también en el servidor, aunque se eluda la validación web.

En **Authentication → Providers → Email**, habilita correo y contraseña y conserva la confirmación del correo. Configura un proveedor **SMTP propio** para correo real de registro y recuperación: el servicio predeterminado de Supabase tiene restricciones y límites de envío. Activa los límites de Auth apropiados para el piloto. Habilita protección contra contraseñas filtradas si tu plan lo permite; no deshabilites los controles para evitar un error.

En los ajustes de API/Connect del proyecto, toma:

- URL del proyecto: `https://TU-PROYECTO.supabase.co`.
- Clave **publishable** (`sb_publishable_...`) o la clave heredada **anon**.

Estas dos son las únicas que usa el navegador. Si la URL utiliza dominio personalizado, adapta `connect-src` en `vercel.json` a ese dominio y WebSocket.

## 2. Vercel

En tu cuenta Vercel elige **Add New → Project**, importa `lmsincronia-design/Rey-de-las-micheladas-app`, y usa:

- Rama de producción: `main`.
- Root Directory: **raíz del repositorio**; no `original/club-app`.
- Framework: **Vite**.
- Build Command: `npm run build`.
- Output Directory: `dist`.
- Node: **24.x**, o una versión compatible ≥22.13.

Antes de desplegar, agrega para Production (y Preview si la usarás):

```text
VITE_SUPABASE_URL         URL de tu proyecto Supabase
VITE_SUPABASE_ANON_KEY    clave publishable o anon
```

Vite incorpora estas variables durante el build. Si las agregas después, ejecuta **Redeploy**. No pongas `service_role`/secret en una variable `VITE_`.

La web ya incluye rutas SPA y la función `/api/pos`. La API de caja retorna 503 hasta que se configuren sus credenciales; las cuentas/amigos no dependen de esa API.

## 3. Redirecciones de correo

Cuando conozcas la URL estable de Vercel, en **Supabase → Authentication → URL Configuration**:

- Site URL: `https://rey-de-las-micheladas-app.vercel.app` (o el dominio definitivo).
- Redirect URLs: `https://rey-de-las-micheladas-app.vercel.app/entrar` y `https://rey-de-las-micheladas-app.vercel.app/recuperar`.
- Para desarrollo: `http://localhost:5173/entrar` y `http://localhost:5173/recuperar`.

Agrega las URLs de Preview concretas cuando las uses; evita permitir todos los dominios. Los enlaces de recuperación se abren en `/recuperar`, con la sesión de recuperación gestionada por Supabase. Prueba los enlaces en el mismo navegador desde el que se solicitaron: el cliente utiliza PKCE.

Configura en Auth la longitud mínima de contraseña de 10 caracteres o superior, de acuerdo con la validación web.

## 4. Tu primer administrador

Registra y confirma tu propia cuenta en la app. En **Authentication → Users**, copia su User UID. En SQL Editor:

```sql
insert into public.staff (user_id, role)
values ('REEMPLAZAR-POR-TU-USER-UID'::uuid, 'admin');
```

No uses `user_metadata` para conceder permisos: el usuario puede modificar sus metadatos; la app solo confía en `public.staff`, que no permite escrituras desde el navegador.

Vuelve a iniciar sesión y abre `/admin` (también aparece el enlace “Panel del equipo” en Perfil).

## Prueba inmediata de coronas entre amigos

Para preparar las cuentas de Martín/Luis y las cinco boletas ficticias, sigue [el recorrido completo de pruebas](PRUEBA-MARTIN-LUIS.md).

Con la segunda migración aplicada y tu cuenta como administrador:

1. Abre `/admin` → **Acreditar coronas**. Copia tu código desde `/codigo` o elige un socio del campo de código.
2. Acredita 5.000 coronas con motivo «Prueba de envío entre amigos» y confirma el destinatario. Aparecen disponibles de inmediato. Cada carga registra administrador, destinatario, monto y motivo; puedes consultar las últimas 50.
3. Tu amigo se registra y confirma su correo. En `/amigos`, uno comparte su QR/código y el otro envía la solicitud. El destinatario debe aceptarla.
4. Envía 2.000 coronas desde **Amigos → Enviar**. Si ambos partieron en cero y no tenían deuda, quedan 3.000 para ti y 2.000 para tu amigo. Cada corona equivale a $1 CLP de descuento.

Las acreditaciones son saldo utilizable en este proyecto, quedan en el libro de movimientos y no aumentan el rango. No es dinero ficticio separado: carga solo el monto que quieras habilitar. El tope es 20.000 por acreditación. Si existe deuda por una boleta anulada, la carga la cubre primero. Solo los administradores pueden acreditar; un cajero o socio no puede concederse saldo.

## 5. Cinco locales reales

Desde `/admin`, agrega al menos cinco locales que identifiques en el enlace QRFY:

- Nombre y dirección reales.
- Comuna.
- URL HTTPS de **la carta de ese local** (no un enlace inventado).
- Latitud/longitud opcionales y verificadas.
- Marca activo/verificado únicamente al confirmar los datos.

No hay locales ficticios sembrados en la base. El enlace original permanece como alternativa mientras se cargan. Cada botón “Abrir carta” abre el enlace oficial en una pestaña nueva. Al abrir una carta individual se avisa a amigos aceptados, si el usuario activó compartir actividad, respetando el silencio por amigo. No se envían avisos al cambiar la comuna o seleccionar un local.

## 6. Caja manual antes de conectar el POS

Registra una cuenta de empleado, confirma el correo y asigna su UID a un local real:

```sql
insert into public.staff (user_id, role, location_id)
values ('UID-DEL-EMPLEADO'::uuid, 'cashier', 'UUID-DEL-LOCAL'::uuid);
```

Ese empleado entra por correo/contraseña y abre `/caja`; solo puede operar el local asignado. El administrador puede operar todos los locales.

1. Consulta al socio por código; verifica con el cliente.
2. El cliente reserva una ficha desde Coronas para ese local.
3. Caja confirma la ficha **antes de emitir la boleta**, aplica el descuento en su sistema real y conserva el código.
4. Emite la boleta por el monto neto cobrado.
5. Registra folio, monto neto, comensales, códigos de socios y la ficha aplicada. Cada socio gana por su parte; las coronas se activan en 24 horas.
6. Si se anula, informa el mismo folio: la app revierte la compra y devuelve el descuento vinculado exactamente una vez.

La pantalla del Club no modifica el sistema de caja real ni emite una boleta tributaria. El empleado debe registrar la operación en el POS del local; automatizar esto requiere su integración.

## 7. Integración automática de caja

Ver `docs/API-CAJA.md`. Solo al realizar esta integración agrega en Vercel las variables **de servidor**:

- `SUPABASE_URL`.
- `SUPABASE_SERVICE_ROLE_KEY` (clave heredada service_role o clave secret del servidor).
- `POS_KEYS_JSON` (mapa de UUID del local a SHA-256 de su llave).

Cada local lleva su propia llave. No pongas estos valores en el frontend, en `.env.example` ni en Git. La RLS y los permisos bloquean acreditación y confirmación desde la clave pública; el servidor es el único puente para el POS externo.

## 8. Comprobación antes de un piloto

Usa dos cuentas de prueba con correos que controlas. Verifica en el Supabase real:

- Registro, confirmación, acceso, salida y recuperación de contraseña.
- Datos personales visibles solo para su dueño; un usuario común no tiene acceso a administración/caja.
- QR/código → solicitud → aceptación de amistad.
- Compartir actividad activado: abrir carta avisa; cambiar comuna no. Silenciar a un amigo impide sus futuros avisos de actividad; no impide recibir coronas.
- Boleta de prueba emitida desde una cuenta de caja. Saldo pendiente hasta 24 horas y rango por consumo. No acelera el saldo en producción.
- Acreditación manual del administrador y transferencia inmediata; cuenta común y caja no pueden acreditar.
- Transferencia después de la activación: débito/crédito exactos, sin duplicar un reintento.
- Ficha, confirmación, cancelación, vencimiento y anulación de boleta con devolución del descuento vinculado.
- Realtime y fallback de notificaciones con dos navegadores. No existe push con la app cerrada.

La migración y UI tienen pruebas locales; estas comprobaciones remotas siguen pendientes hasta conectar tus cuentas. Los endpoints Realtime y correo son del proyecto real, no del simulador de pruebas.

Antes de recibir clientes reales: validar márgenes/porcentajes/topes con el Rey, conectar el POS real, completar términos y contacto de privacidad, aprobar las imágenes de marca y definir las funciones del original que se migrarán en la siguiente etapa.
