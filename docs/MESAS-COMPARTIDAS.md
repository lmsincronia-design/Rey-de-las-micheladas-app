# Repartir las coronas de una mesa

Aplica una vez [006_table_shares.sql](../supabase/migrations/202610070006_table_shares.sql) en Supabase → SQL Editor, después de las migraciones anteriores. Publica el nuevo commit de `main` en Vercel. No necesitas nuevas variables ni claves.

## Lo que recibe cada persona

El total es el monto **neto pagado**, después de descuentos. Se divide en pesos enteros entre todas las personas que consumieron, incluidas las que todavía no tienen cuenta. El porcentaje se aplica sobre la parte individual:

| Total $100.000 / 5 personas | Base individual | Porcentaje | Coronas |
|---|---:|---:|---:|
| Plebeyo | $20.000 | 4% | 800 |
| Comerciante | $20.000 | 6% | 1.200 |
| Guardia Real | $20.000 | 8% | 1.600 |
| Noble | $20.000 | 10% | 2.000 |
| Rey | $20.000 | 12% | 2.400 |

Cada persona suma **solo $20.000 de consumo** para su rango. Quien paga no recibe el consumo ni las coronas de los demás. El rango utilizado es el de cada socio antes de su acreditación/reclamo; un nuevo socio comienza en Plebeyo. Se mantiene el tope de 8.000 coronas por persona y boleta.

Si la división no es exacta, se redondea la base hacia abajo al peso entero para todos (por ejemplo, $100.001 / 5 = $20.000 por persona). El resto no genera coronas adicionales. Las coronas también se calculan en enteros.

## Recorrido real

1. Quien paga entra en **Mi código y mi mesa** (`/codigo`). Indica la cantidad total de personas, incluyéndose, y pulsa **Preparar código para caja**.
2. La app genera un código de mesa que comienza con `M`, su QR, cantidad de personas y vencimiento de 24 horas. Es distinto del código permanente de socio. Para cambiar la cantidad se prepara un nuevo código; una mesa ya pagada no puede ampliarse.
3. Caja consulta ese código y confirma que la cantidad corresponde a la mesa. En `/caja`, la consulta completa automáticamente cantidad de personas y código en el formulario de venta. Caja registra folio y total neto de la boleta real. Si hubo descuento, vincula la ficha correspondiente.
4. La base acredita al pagador únicamente su parte y genera un enlace con los cupos restantes. El pagador abre **Coronas → Las coronas de tu mesa** y pulsa **Compartir con mi mesa** o **Copiar enlace**.
5. Los acompañantes abren el enlace. Si tienen sesión, se reclama automáticamente un cupo. Si no, pueden iniciar sesión o registrarse desde esa pantalla; la invitación se conserva durante el registro y en los metadatos de su cuenta para retomarla después de confirmar el correo, incluso al iniciar sesión desde otro navegador.
6. Cada participante recibe su propio porcentaje sobre la misma base individual. Las coronas quedan pendientes **24 horas desde la acreditación de su parte**, también cuando se registra después de la compra. Reabrir el enlace no duplica el consumo ni las coronas.

El enlace funciona en navegador: no exige instalar una app. Compartir no envía mensajes automáticamente; abre el menú de compartir del dispositivo o copia el enlace. El enlace dura **7 días** desde que se registra la mesa. Cualquier cuenta con el enlace puede reclamar un cupo disponible: compártelo únicamente con los integrantes de esa mesa.

El registro requiere confirmar el correo según la configuración de Supabase. Los correos y su entrega siguen dependiendo de Auth/SMTP. No se inventan sesiones ni se omite la confirmación.

## Probar $100.000 entre cinco

Usa cuentas de prueba y el local virtual ya preparado. Como Luis tiene permisos de administrador, puede representar también a caja:

1. En `/codigo`, prepara una mesa de **5** y copia el código `M…`.
2. Abre `/caja` y elige **Rey de pruebas · NO ES UN LOCAL REAL**.
3. Consulta el código de mesa. Verifica que aparezcan **5 personas**.
4. Registra un folio ficticio nuevo, por ejemplo `MESA-100000-01`, total **100000**, las 5 personas y el código de mesa. No hace falta otra boleta `PRUEBA-…` predefinida.
5. En `/coronas`, copia el enlace de esa mesa y ábrelo con cuatro cuentas diferentes. Una puede crearse desde el enlace para probar el alta y la vuelta al reclamo.
6. Comprueba que haya cinco partes de $20.000; el pagador ocupa una y quedan cuatro cupos. Las coronas aparecen pendientes, no disponibles. Un sexto usuario no puede reclamar.
7. Para probar la reversión, anula `MESA-100000-01` desde caja. Se revierten todos los consumos/coronas que ya se acreditaron y el enlace deja de aceptar reclamos. Las partes sin reclamar nunca se acreditaron.

También puedes usar una boleta `PRUEBA-…` aún disponible: prepara primero el código de mesa, luego selecciónalo en **Coronas → Ingresa tu boleta → Mesa de esta boleta** antes de canjear. La cantidad queda fijada al primer canje; volver a introducir el código no crea cupos ni coronas adicionales.

Las pruebas escriben movimientos en el mismo proyecto: no son una base separada. El local y folio deben identificarse como ficticios. Cerrar el piloto también vence sus enlaces de mesa; no borra el historial ni los saldos ya registrados.

## Controles del servidor

- El cliente no puede fijar total, porcentaje ni coronas. Solo prepara una cantidad de personas entre 1 y 20.
- El total llega de caja autorizada o de una boleta de prueba predefinida. El código de mesa debe coincidir con la cantidad confirmada por caja.
- Los invitados no reciben permisos de caja y no pueden consultar perfiles de otros integrantes.
- El enlace utiliza un token aleatorio; su consulta pública muestra monto, parte, local y cupos, sin nombres, RUT ni identificadores de otros socios.
- El servidor bloquea la fila de la boleta al reclamar o anular. Cada cuenta tiene una única acreditación por boleta; los reintentos de caja siguen funcionando después de los reclamos tardíos.
- Las anulaciones revierten todas las partes ya reclamadas. Si una persona ya gastó coronas activadas, el ajuste se cubre con sus futuros ingresos, como en las boletas normales.
- Los códigos de socios múltiples del POS anterior siguen funcionando; para reparto por enlace se usa un único código de mesa.

## Rangos y portada

La foto proporcionada está en `public/assets/foto-junta-rey.jpg`, copiada sin modificar desde `reyy.jfif`. Los rangos tienen distintivos vectoriales, porcentaje, consumo mínimo y progreso hacia el siguiente nivel. La cabecera muestra el rango de la cuenta conectada y se actualiza al consultar su saldo. Los niveles son Plebeyo, Comerciante, **Guardia Real**, Noble y Rey.

## Validación

Las pruebas SQL comprueban el reparto $100.000/5 con los cinco porcentajes, límites de cupos, reintentos, permisos, nuevas cuentas, espera de 24 horas, vencimientos y anulaciones. Las pruebas de navegador recorren pagador → caja → enlace → registro → ingreso desde otro navegador → coronas pendientes del invitado, con la frontera HTTP de Supabase simulada. No sustituyen la prueba del correo y POS reales en el proyecto desplegado; la app no emite boletas tributarias ni modifica el sistema de cobro externo sin su integración.
