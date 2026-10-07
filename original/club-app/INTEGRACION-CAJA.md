# Integración de la caja con el Club del Rey (para el equipo de TI)

**Idea central:** cada socio tiene un **código personal** (6 caracteres, ej. `KRW-GMQ`, también en QR) que ve en su app. El garzón o la caja lo usa **antes de emitir la boleta**:

1. Escribe el código → ve el nombre, el rango y las **coronas disponibles** del cliente (base de datos actualizada al segundo).
2. Descuenta las coronas que el cliente quiera usar → **el descuento queda en el total antes de emitir la boleta** (la caja siempre cuadra).
3. Emite la boleta y la envía al Club con los códigos de los socios de la mesa → **las coronas se acreditan solas**, sin que nadie ingrese nada después.

El Club nunca escribe en la caja ni la consulta por su cuenta: la caja pregunta y la caja manda. Si la conexión falla, la venta sigue normal; se reenvía después (es idempotente).

## Ejemplo: mesa de 5 que paga $150.000, con un descuento de $2.000

| Paso | Qué hace la caja | Resultado |
|---|---|---|
| 1 | `GET /api/caja/socios/KRW-GMQ` | "Gabriela S., Comerciante, 3.240 coronas disponibles" |
| 2 | `POST /api/caja/socios/KRW-GMQ/canje` `{ "monto": 2000 }` | Se descuentan 2.000 coronas. Devuelve `canje_codigo`. |
| 3 | Emite la boleta por **$148.000** | Total ya descontado |
| 4 | `POST /api/caja/boletas` con `socios: ["KRW-GMQ", "..."]`, `canje_codigo` y `comensales: 5` | Cada socio recibe coronas por su parte ($29.600) según **su** rango. Las partes sin código quedan para el enlace de la mesa. |

## API

Todas las llamadas llevan `Authorization: Bearer <llave-api-del-local>` (se genera en `/admin` → Locales).

### 1. Consultar un cliente

`GET /api/caja/socios/<codigo>` (mayúsculas o minúsculas, con o sin guion)

```json
{ "socio": {
    "codigo": "KRWGMQ", "nombre": "Gabriela S.",
    "rango": { "id": "comerciante", "nombre": "Comerciante", "pct": 10 },
    "coronas": { "disponible": 3240, "por_activar": 0, "proxima_activacion": null },
    "canje": { "puede": true, "motivo": null, "minimo": 1000, "maximo": 20000, "multiplo": 500, "hoy": 0, "por_dia": 1,
               "maximo_ahora": 3000, "sugeridos": [1000, 2000, 3000] },
    "regalo": { "disponible": false, "motivo": "fuera_de_fecha" } } }
```
Errores: `404 socio_no_encontrado`, `400 codigo_invalido`, `403 cuenta_bloqueada`, `403 cuenta_personal` (equipo: no acumula). Quien intenta muchos códigos que no existen se bloquea unos minutos.

### 2. Descontar coronas (antes de emitir la boleta)

`POST /api/caja/socios/<codigo>/canje` `{ "monto": 2000 }`
Valida monto (múltiplos, mínimo/máximo, un canje por día, saldo suficiente) y lo aplica **al tiro**. Si el cliente había generado una ficha en su app, se reemplaza.
Respuesta `201`: `{ "descuento": 2000, "canje_codigo": "K7M29X", "socio": { ...coronas al día... } }`.
Guarda `canje_codigo` y envíalo al registrar la boleta (punto 4): así, si la boleta se anula, las coronas vuelven al cliente.

### 3. Regalo de cumpleaños

`GET` del punto 1 trae `regalo.disponible: true`, la descripción y el cumpleaños (`"nacimiento": "08/10/1995"`) **para compararlo con la cédula**.
`POST /api/caja/socios/<codigo>/regalo` `{ "cedula_verificada": true }` → lo entrega (una vez al año).

### 4. Enviar la boleta emitida (acredita las coronas)

```
POST /api/caja/boletas
{
  "folio": "48213",              // único por local
  "monto": 148000,               // lo cobrado, YA con el descuento
  "comensales": 5,               // personas en la mesa: la cuenta se reparte en partes iguales
  "socios": ["KRWGMQ", "H4MP7T"],// códigos personales de quienes la dieron; el PRIMERO es quien paga
  "canje_codigo": "K7M29X",      // el del paso 2, si hubo descuento
  "emitida_en": "2026-10-08T21:14:00-03:00"   // opcional
}
```
Respuesta `201` (o `200` si el folio ya existía):
```json
{ "ok": true, "boleta": { "folio": "48213", "codigo": "3MZ-PFF", "estado": "reclamada" },
  "canje": { "ok": true, "ya_aplicada": true },
  "acreditacion": { "ok": true,
    "socios": [ { "codigo": "KRWGMQ", "nombre": "Gabriela", "pct": 10, "coronas": 2960, "ascendio": false },
                { "codigo": "H4MP7T", "nombre": "Ana", "pct": 8, "coronas": 2368, "ascendio": false } ],
    "mesa": { "personas": 5, "parte": 29600, "libres": 3 } } }
```
* Hasta **8 códigos** por boleta. Cada uno gana según **su propio rango** sobre **su parte** (`monto ÷ comensales`), con el tope por persona configurado.
* **Todo o nada:** si algún código no existe, está repetido o la cuenta está bloqueada, la boleta se registra igual pero `acreditacion.ok` es `false` y no se acredita a nadie. Corrige y **reenvía el mismo folio** con los códigos buenos.
* Es **idempotente**: reenviar el mismo folio no duplica coronas (`boleta_ya_acreditada`). Con otro monto responde `409 folio_distinto`.
* Si vas a emitir sin códigos (el cliente no usó la app), omite `socios`: la boleta queda con un código impreso (`boleta.codigo`) que el cliente puede ingresar después en la app, o sus amigos reclaman con el enlace de la mesa (48 h).

### 5. Anular una boleta

`POST /api/caja/boletas/anular` `{ "folio": "48213" }` — revierte las coronas y el consumo de **todos** los socios de esa mesa y devuelve las coronas del descuento.

### 6. Base de datos de coronas por código (para sincronizar con su sistema)

`GET /api/caja/socios?desde=0&limite=500` → lista paginada y actualizada:
```json
{ "actualizado_en": 1791328484433, "siguiente": 500,
  "socios": [ { "codigo": "KRWGMQ", "nombre": "Gabriela S.", "rango": "Comerciante", "pct": 10,
                "coronas_disponibles": 3240, "coronas_por_activar": 0, "consumo_12m": 59250, "ultimo_movimiento": 1791328484433 } ] }
```
Repite con `desde=<siguiente>` hasta que `siguiente` sea `null`. Para una consulta al instante de un cliente, usa el punto 1 (siempre refleja el saldo real).
El mismo listado se descarga desde `/admin` → Socios → "Descargar coronas por código (CSV)" (se abre en Excel).

## Si no se puede integrar todavía

* **Pantalla de caja** (`/caja`, con el PIN del local): el cajero escribe el código del cliente, aplica el descuento y, en la demostración, simula la boleta. Es el mismo proceso por pantalla, sin tocar la caja real.
* **Excel:** `/admin` → *Importar ventas* acepta filas pegadas o un CSV (`;` o `,`): `Local;Folio;Monto;Fecha;Comensales`. Esas boletas llevan código impreso: el cliente las ingresa en la app.

## Seguridad y operación

* Cada local tiene su **llave de API** (se muestra una sola vez) y un **PIN** para `/caja`. Ambos se pueden regenerar. La llave no da acceso a datos sensibles: solo nombre abreviado, rango y coronas.
* **Riesgo conocido:** quien conozca el código de un socio y esté en caja podría descontar sus coronas. Mitigación: máximo un descuento por día y $20.000, todo queda en auditoría, el socio ve cada movimiento en su app (y su pantalla "Mi código" lo muestra al instante), y se puede bloquear. Si el Rey quiere más seguridad, se puede exigir que el cliente apruebe el descuento en su celular.
* Los límites contra abuso (códigos inexistentes, PIN, consultas) devuelven `429`. Reintentar con espera creciente.
* Errores comunes: `401 llave_invalida`, `400 monto_invalido`, `400 folio_invalido`, `409 folio_distinto`.

## Preguntas que conviene resolver con TI

1. ¿El sistema de caja puede llamar una API HTTPS **antes** de emitir (consultar y descontar) y **después** (enviar la boleta)?
2. ¿Hay un campo donde el garzón pueda escribir el código del cliente (o leer el QR)?
3. ¿Se registra el número de comensales por mesa?
4. ¿Cómo registran hoy un descuento o cortesía antes de emitir la boleta?
5. ¿Es el mismo sistema en los 31 locales? (si sí, es **una** integración, no 31)
6. ¿Prefieren consultar cada cliente al instante (punto 1) o sincronizar el listado (punto 6)?
