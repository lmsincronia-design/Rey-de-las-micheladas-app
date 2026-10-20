# Rediseño (v3, oct-2026): identidad real del Rey

Detalle de la investigación y las decisiones: `demos/rey-de-las-micheladas/investigacion-diseno/README.md`.

## Qué cambió respecto a la v2 (la publicada el 19-oct)
- Paleta **del Rey**: negro `#020201`, amarillo `#FCCB09`, rojo `#F8393B`, lima del logo. Se eliminó el oliva y el lima ajenos a la marca.
- Tipografía: **Londrina Solid** (títulos y cifras) + **Barlow** (texto) + Kaushan Script (caligrafía del logo). Archivos locales en `public/fonts/`.
- Íconos: **Phosphor** (MIT) en `src/icons.js`. Reposo *bold*, activo *fill*.
- **Carta de socio** en el inicio, con el avance de rango; fichas como tickets; fotos de la carta en círculo con aro rojo.
- **Insignias de rango: se conservan las originales del Club** (imágenes en `public/assets/rangos/` y sus colores). Queda disponible una alternativa vectorial (`crestSvg`, con `RANK_ART='vector'` en `src/ranks.js`), pero NO se usa.
- Mosaico de limones real (`public/assets/marca/limones.png`, período 418 px) como fondo con desvanecido y grano fino.
- Ilustraciones propias (`public/assets/marca/{corona,lima,jarro}.svg`).
- Barra de pestañas plana; se quitó el botón central flotante.

## Archivos
`src/app.css` (sistema de diseño), `src/styles.css` (estructura y pantallas internas, con colores y fuentes migrados), `src/icons.js`, `src/ranks.js`, `src/main.js` (shell, inicio, locales), `src/ranking.js`.

## Volver atrás
- Diseño v2 publicado el 19-oct: `git checkout ui-v2-app-rediseno -- .`
- Diseño original (antes de cualquier rediseño): `git checkout ui-v1-antes-del-rediseno -- .`
- Copias de archivos en `../_respaldo-club-antes-de-carta/ui-v1` y `ui-v2`.

## Pruebas y capturas
`node test/capturas.mjs <carpeta> [ancho] [alto]` (datos de ejemplo; `CAPTURA_ADMIN=1` agrega admin y caja).
`node test/csp-check.mjs` verifica la política de seguridad de `vercel.json` sobre el sitio compilado.
