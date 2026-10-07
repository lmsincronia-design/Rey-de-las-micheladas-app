# Probar el Club con Martín y Luis

Web: https://rey-de-las-micheladas-app.vercel.app

Esta prueba usa las cuentas existentes y el saldo del mismo proyecto Supabase. Las boletas son ficticias, están identificadas con `PRUEBA-` y no son documentos tributarios. No crea cuentas ni contraseñas ficticias. Los saldos y el consumo de prueba permanecen registrados; no es una base aislada de producción.

## Cargar las coronas ahora

En Supabase → **SQL Editor → New query**, pega y ejecuta completo [cargar-coronas-martin-luis.sql](../supabase/scripts/cargar-coronas-martin-luis.sql).

Funciona con la migración inicial 001: busca una única cuenta con nombre exacto Martín/Martin y una única Luis; agrega 5.000 y 3.000 coronas y muestra nombre, apellido, código y saldo. Si faltan cuentas o hay nombres repetidos, se detiene sin hacer cambios. En ese caso identifica a las personas con esta consulta y usa el panel de administrador por código después de actualizar:

```sql
select first_name, last_name, member_code from public.profiles order by first_name;
```

El script suma al saldo existente; no reemplaza el saldo ni aumenta el rango. Si existe deuda por una anulación, se cubre primero. Es seguro repetirlo: usa las mismas referencias que la preparación del panel para no duplicar cargas. En una base con solo la migración 001, registra la carga como movimiento `purchase`, con consumo cero y la nota `PRUEBA: saldo inicial…`, sin boleta asociada.

## Actualizar Supabase para porcentajes y boletas

La integración Git no ejecuta estas migraciones por sí sola. Aplica en SQL Editor, completos y en este orden, **solo los archivos pendientes**:

1. [002_admin_credits.sql](../supabase/migrations/202610070002_admin_credits.sql): acreditaciones con auditoría.
2. [003_tier_rates.sql](../supabase/migrations/202610070003_tier_rates.sql): nuevos porcentajes y Guardia Real.
3. [004_test_pilot.sql](../supabase/migrations/202610070004_test_pilot.sql): preparación, cinco boletas y cierre.
4. [005_enforce_receipt_wait.sql](../supabase/migrations/202610070005_enforce_receipt_wait.sql): elimina el atajo de activación anticipada. Las coronas de boletas esperan 24 horas desde el canje del código, también en pruebas.

No vuelvas a ejecutar la migración inicial 001. Los nuevos porcentajes se aplican a compras posteriores, sin recalcular movimientos antiguos.

Si Luis todavía no es administrador, identifica su cuenta en **Authentication → Users**, copia su UID y ejecuta:

```sql
insert into public.staff(user_id, role)
values ('REEMPLAZA-CON-EL-UID-DE-LUIS'::uuid, 'admin')
on conflict (user_id) do update set role='admin', location_id=null;
```

Cierra sesión y vuelve a entrar para cargar el permiso.

## Preparar las cinco boletas

Después de que Vercel despliegue el cambio, entra como administrador a **Perfil → Probar el Club**, o abre `/pruebas`.

Selecciona la cuenta de Martín y la de Luis por nombre/código. Confirma la preparación. Agrega las coronas iniciales una sola vez; si ejecutaste el SQL anterior, conserva esas cargas. Crea un local virtual **Rey de pruebas · NO ES UN LOCAL REAL**, visible solo para los dos participantes, y estas cinco boletas:

| Código | Total pagado ficticio | Coronas si el rango previo es Plebeyo (4%) |
|---|---:|---:|
| `PRUEBA-15000` | $15.000 | 600 |
| `PRUEBA-30000` | $30.000 | 1.200 |
| `PRUEBA-60000` | $60.000 | 2.400 |
| `PRUEBA-90000` | $90.000 | 3.600 |
| `PRUEBA-120000` | $120.000 | 4.800 |

Cada código es de un solo uso **entre ambos**, no cinco boletas por persona. Solo los participantes seleccionados pueden canjearlos. Repetir un canje propio no duplica coronas; si ya lo usó el otro socio, se rechaza.

Los importes son netos, después de un eventual descuento. Cada boleta corresponde a un comensal. Al acumular consumo, cambia el porcentaje para la siguiente compra; por eso las coronas reales pueden superar la última columna. Se conserva el tope de 8.000 por persona/boleta.

| Nivel | Consumo en los últimos 12 meses | Devolución en coronas |
|---|---:|---:|
| Plebeyo | Desde $0 | 4% |
| Comerciante | Desde $50.000 | 6% |
| Guardia Real | Desde $150.000 | 8% |
| Noble | Desde $350.000 | 10% |
| Rey | Desde $700.000 | 12% |

El beneficio se acumula como coronas: **1 corona = $1 CLP** de descuento posterior. El rango no aplica un segundo descuento automático al total cobrado. Las transferencias y cargas iniciales no aumentan el rango.

## Recorrido completo

1. Abre Martín y Luis en dos navegadores o perfiles separados. Cada uno inicia sesión con su cuenta confirmada.
2. En **Amigos**, comparte QR/código, envía solicitud y acéptala desde el otro usuario.
3. Envía 1.000 coronas de Martín a Luis. Si partían con las cargas iniciales, quedan 4.000 y 4.000.
4. Activa **Avisar a mis amigos cuando abra una carta** en Perfil de Martín. En Locales abre la carta del local de pruebas. Luis debe recibir el aviso dentro de la app. Filtrar/seleccionar comuna no avisa. Desde Luis puedes silenciar a Martín; respeta el antispam de 15 minutos y dos horas para repetir local.
5. En Coronas, Martín crea una ficha de 1.000 para el local virtual. Se reserva ese saldo. Si no vas a usarla, cancélala y comprueba la devolución.
6. En **Coronas → Ingresa tu boleta**, justo debajo del saldo, Martín introduce `PRUEBA-60000` y, opcionalmente, su ficha. Canjear valida la ficha como caja, genera la compra y acredita las coronas pendientes.
7. Comprueba que las coronas de esa boleta están **por activar**, sin incrementar el saldo disponible. Espera 24 horas desde el canje del código: al consultar el saldo después de ese plazo, se acreditan automáticamente. No existe botón para adelantar ese plazo.
8. Envía las coronas activadas a tu amigo y consulta los movimientos en ambos usuarios.
9. En `/caja`, como administrador, selecciona el local virtual y anula `PRUEBA-60000`. Comprueba reversión y devolución de la ficha vinculada. Repetir la anulación no duplica la devolución. Si las coronas ya se gastaron, se registra deuda a cubrir con futuras cargas.
10. Canjea las restantes para probar cambios de rango y saldos. Una ficha de descuento por día sigue vigente: cancelar una reserva permite otra; usarla consume el canje diario. Puedes canjear boletas sin ficha adicional ese día.

Para terminar, usa **Cerrar la prueba** en `/pruebas`: bloquea nuevos canjes de los códigos, oculta el local virtual y devuelve reservas pendientes. **Conserva saldos, rangos y movimientos**. No borra datos ni revierte compras automáticamente. No hay botón para reabrir/recrear la prueba y recargar indefinidamente.

## Qué se ha validado

Las pruebas locales ejecutan las migraciones y funciones SQL reales en PGlite, y recorren la interfaz en Chromium con las respuestas HTTP de Supabase simuladas. Cubren acceso, idempotencia, porcentajes, amistades, transferencias, boletas, fichas, activación, anulaciones y cierre. No equivalen a haber ejecutado las migraciones en tu proyecto ni a haber confirmado el correo/Realtime de producción. La carga remota se confirma por el resultado que muestra SQL Editor y los saldos de ambas cuentas.
