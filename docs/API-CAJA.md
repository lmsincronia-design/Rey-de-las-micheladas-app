# API de caja · Vercel + Supabase

`POST https://TU-APP.vercel.app/api/pos`

Cabeceras: `Content-Type: application/json`, `Authorization: Bearer LLAVE-DEL-LOCAL`.

El cuerpo siempre incluye `local_id` (UUID real del catálogo). La función Vercel compara el SHA-256 de la llave con `POS_KEYS_JSON[local_id]`, por lo que una llave de un local no opera otro. No utiliza las llaves de ejemplo del prototipo original.

## Crear una llave por local

El administrador puede generar una llave en una máquina confiable:

```js
// node --input-type=module (ejecutar localmente; no compartir ni guardar en Git)
import { randomBytes, createHash } from 'node:crypto';
const token = randomBytes(32).toString('hex');
console.log('Llave para configurar en el POS:', token);
console.log('Hash para Vercel:', createHash('sha256').update(token).digest('hex'));
```

Guarda la llave en el POS y el hash en Vercel. Ejemplo de estructura de `POS_KEYS_JSON` (sustituir todos los marcadores):

```json
{"UUID-DEL-LOCAL-1":"HASH-SHA256-DE-64-CARACTERES","UUID-DEL-LOCAL-2":"OTRO-HASH"}
```

Rotación: reemplaza el hash del local en Vercel, redeploy y configura su nueva llave en el POS. Revocación: elimina su entrada.

## Consultar un socio

```json
{"local_id":"UUID-LOCAL","action":"member","code":"CODIGO-SOCIO"}
```

Devuelve nombre abreviado, código, saldo disponible, pendiente y consumo; no RUT, teléfono, correo ni cumpleaños.

## Confirmar la ficha antes de emitir

```json
{"local_id":"UUID-LOCAL","action":"confirm_redemption","code":"CODIGO-FICHA"}
```

El cliente ya reservó esa ficha en su app y eligió el local. Devuelve monto y `already_used`. **Si `already_used` es true no vuelvas a aplicar el descuento.** La reconsulta es idempotente para tolerar un corte de conexión; conserva el ID de operación en tu POS.

## Registrar boleta neta

```json
{
 "local_id":"UUID-LOCAL", "action":"sale", "folio":"48213",
 "amount":148000, "people":5,
 "codes":["CODIGO-SOCIO-1","CODIGO-SOCIO-2"],
 "redemption_code":"CODIGO-FICHA-APLICADA"
}
```

`redemption_code` es opcional si no hubo descuento. Si hubo descuento, envíalo para vincular la ficha y devolverlo al anular. La ficha debe pertenecer a un socio incluido en la boleta y al mismo local; solo se vincula a una boleta.

Hasta ocho códigos únicos de socios, y nunca más códigos que comensales. En ese modo se acredita a los socios que dieron su código. Para que los acompañantes reclamen después, usa el modo de código de mesa que se describe abajo. Mismo local+folio+datos → mismo resultado; datos contradictorios → error. Los importes son pesos enteros. Cuenta dividida en partes iguales (redondeo hacia abajo), porcentaje según rango previo a la visita, tope 8.000/persona, disponibles en 24 horas.

Registra una venta de prueba solo cuando el operador la autorice; una llamada de acreditación agrega coronas reales a esta base. No existe un endpoint público para inventar saldo.

## Mesa con reclamo posterior por enlace

El pagador prepara un código de mesa en `/codigo`, por ejemplo `M123456789AB`, con la cantidad de personas. Consulta `member` con ese código: además de los datos habituales devuelve `table_code` y `people`. Confirma la cantidad con la mesa.

Registra la venta con **un solo código de mesa**, conservando la cantidad devuelta:

```json
{"local_id":"UUID-LOCAL","action":"sale","folio":"MESA-100000-01","amount":100000,"people":5,"codes":["M123456789AB"]}
```

El código anterior es ilustrativo: usa el generado en la app. Caja aporta el monto real pagado. La función acredita al pagador su parte ($20.000), guarda el total y crea cuatro cupos de invitación. El pagador obtiene el enlace desde Coronas; no es necesario que el POS lo envíe. Los invitados reciben su propio porcentaje al reclamar. Los reintentos usan el mismo folio/código/datos incluso después de que otros hayan reclamado. El código no se puede reutilizar en otra boleta ni cambiar su cantidad de personas.

Ver [Mesas compartidas](MESAS-COMPARTIDAS.md) para el flujo completo y los vencimientos.

## Anular

```json
{"local_id":"UUID-LOCAL","action":"cancel_sale","folio":"48213"}
```

Revierte consumo/coronas y devuelve el descuento vinculado una sola vez. Si las coronas de compra ya se gastaron o transfirieron, registra deuda y la cubre con ingresos futuros; el saldo gastable nunca es negativo.

## Respuestas

- 200: `{ "ok": true, "data": ... }`.
- 400: operación/datos inválidos, con `error` legible.
- 401: llave inválida o no pertenece al local.
- 405 / 415: método o formato incorrectos.
- 503: faltan credenciales de servidor para conectar caja.

La venta del POS debe seguir funcionando ante un fallo de red. Encola el envío y reintenta el **mismo folio y datos** con espera creciente; jamás crea otro folio para un reintento. Los canjes requieren una confirmación exitosa antes de descontar y no se inventan offline.
