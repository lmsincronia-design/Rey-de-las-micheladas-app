# Ranking del Club (Top 10)

Pantalla `/ranking` (pestaña **Ranking** de la barra inferior). Muestra el podio de los 3 primeros, los puestos 4 al 10, la posición de quien mira ("TOP 27 de 128") y los premios. Junto al rango de la cabecera aparece el chip **TOP 27** (o **👑 TOP 3** dentro del Top 10).

## Qué cuenta
El **consumo de los últimos 12 meses** (`ledger.spending`): exactamente la misma suma que define el rango. Transferencias de coronas no suman. El consumo en locales de prueba (`is_test`) no cuenta. Solo clasifica quien tiene consumo > 0. Desempate: el socio más antiguo.

## Privacidad
- Nadie aparece con nombre si no lo activó (**"Mostrar mi nombre en el ranking"**, apagado por defecto). Si no, es "Socio anónimo" y solo él ve su puesto.
- El nombre público es **nombre + inicial del apellido** (igual que ven los amigos).
- La base no entrega montos ajenos, RUT, celular, correo ni código de socio. Solo la **diferencia** que le falta al propio socio para el puesto de arriba y para entrar al Top 10.
- Pruebas: `test/ranking.test.js` (8 pruebas, incluida la que verifica que no se filtren datos).

## Vista de ejemplo (perfiles ficticios)
`/ranking?demo=1`, o el botón **"Ver ejemplo con perfiles ficticios"**. Sin sesión se ve siempre el ejemplo. Los perfiles viven solo en `src/ranking.js` (`FICTICIOS`): **no existen en la base de datos** y la pantalla los marca con "VISTA DE EJEMPLO".

## Premios del Top 10 (a definir)
`src/ranking.js` → `BENEFICIOS_TOP10`. Vacío = la pantalla dice "Muy pronto". Formato:
```js
export const BENEFICIOS_TOP10=[{icon:'🍺',title:'Michelada de cortesía cada mes',text:'Para los 10 del Top.'}];
```
`IDEAS_EJEMPLO` solo se muestra en la vista de ejemplo, rotulado como idea.

## Base de datos
Migración `supabase/migrations/202610130001_ranking.sql` (**aplicada el 13-oct-2026** en el proyecto `Rey-de-las-micheladas-app`; en otro proyecto, ejecutarla una vez en el SQL Editor):
- `profiles.ranking_visible boolean default false`
- `club_ranking(top_n)` → Top N, total clasificado y la posición del que consulta (requiere sesión)
- `set_ranking_visibility(enabled)`
Sin la migración la app funciona igual: no muestra el chip ni el ranking real, y la vista de ejemplo sigue disponible.

## Decisiones para la reunión
1. **Qué mide el ranking:** monto consumido (hoy) vs. visitas/juntas.
2. **Ventana:** últimos 12 meses móviles (hoy) vs. mensual o por temporada (reinicia y "da chances").
3. **Qué se ve:** hoy solo posición y rango; mostrar montos de otros es opcional y menos privado.
4. **Premios** del Top 10 (y si el premio es por puesto o por estar dentro).
5. **Mesas compartidas:** suma solo la parte de cada uno (ya implementado); decidir si el que paga la cuenta de un grupo debe ganar ventaja.
6. **Revisión legal:** publicidad/promoción de alcohol y datos personales (Ley 21.719) antes de abrirlo a clientes reales.
