# Rediseño "app" (oct-2026)

Objetivo: que el Club se sienta como una app de celular (no como un sitio web) y que insinúe, con sutileza, un reino.

## Qué cambió
- **Navegación:** barra de pestañas inferior con íconos y la corona de *Coronas* al centro; barra superior compacta (logo, avisos, perfil). El rango pasó a una tira bajo la barra.
- **Inicio (socio):** "Tu tesoro" con el saldo y accesos grandes (Usar, Sumar, Regalar, Mi gente, La carta, Ranking, Mi código).
- **Botones y formularios** pensados para el pulgar: ≥ 52 px de alto, texto de 16 px (evita el zoom de iPhone), efecto de pulsado.
- **Íconos:** Lucide (ISC), empaquetados en `src/icons.js`; se eliminaron los emojis.
- **Reino sutil:** etiquetas en Cinzel (tipografía de inscripción), corona-ornamento bajo cada título, trama heráldica casi invisible de fondo, escudos de rango, marca de agua de corona en el "tesoro".
- **App instalable:** `viewport-fit=cover`, áreas seguras (notch), accesos directos del manifiesto (Coronas, Carta, Ranking).

## Archivos
- `src/app.css` (nuevo, se carga después de `styles.css` y lo sobrescribe), `src/icons.js`, `public/fonts/cinzel-latin.woff2`, `public/assets/reino/*`.
- Marcado: `shell()`, `home()`, `locationCards()` en `src/main.js`; íconos en `ranking.js`, `ranks.js`.

## Volver al diseño anterior
Opción rápida (solo estilos): quitar `import './app.css'` de `src/main.js` (los marcados nuevos seguirán, pero con el CSS viejo).
Opción completa: `git checkout ui-v1-antes-del-rediseno -- .` (tag con el diseño publicado el 13-oct-2026), o copiar `../_respaldo-club-antes-de-carta/ui-v1/`.

## Cómo ver las pantallas con datos de ejemplo
`node test/capturas.mjs <carpeta> [ancho] [alto]` (Supabase simulado; `CAPTURA_ADMIN=1` agrega admin y caja).
`node test/csp-check.mjs` verifica que el sitio compilado cumple la política de seguridad de `vercel.json`.
