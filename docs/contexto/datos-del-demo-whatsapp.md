# Demo WhatsApp — El Rey de las Micheladas

Archivo: `video-whatsapp-rey-9x16.mp4` (1080×1920, ~61 s, mudo). Fuente editable: `video-whatsapp-rey-9x16.html`.
Re-renderizar: `node render-whatsapp-rey.js` (fotogramas sueltos para revisar: `node render-whatsapp-rey.js --snap 12,30,48`).

## Qué muestra (guion)
| Seg | Escena |
|---|---|
| 0–4 | Gancho: logo + "Tu WhatsApp, atendiendo solo los 31 locales" |
| 5–9 | Cliente saluda, el bot responde casual ("¡Hola, crack! 👑🍻") |
| 10–13 | Menú interactivo (lista desplegable con 5 opciones) |
| 13–24 | Locales: pide ubicación, sugiere 3 locales cercanos, manda mapa + horario |
| 24–31 | Carta y precios |
| 32–40 | Promo/combo del día (franja de días, hoy resaltado) |
| 41–53 | Reserva de cumpleaños: elige local, hora, confirma, y le llega aviso al encargado |
| 53–61 | Cierre: "Un solo WhatsApp. 31 locales." + logo Rey + LM + WhatsApp de contacto |

## Datos REALES (de prensa, biolink y Mall Plaza)
- Michelada desde **$2.990**, **sin cobro extra por limón ni sal**.
- Promo: **schop (cualquiera) = michelada gratis**.
- Direcciones: REY X Nueva Providencia 2584 (Metro Tobalaba), REY IV Nueva Providencia 2020, REY XI Gral. Holley 109 (Los Leones), REY I Pío Nono 105, REY III Av. Italia 1571 (Ñuñoa), REY XIII Chacabuco 73 (Maipú) — del biolink oficial (15 locales listados).
- Cierre a las **03:00** (entrevista La Cuarta, mar-2026). Sánguches XL, completos y mojitos existen.
- Logo: el avatar del biolink (200×200 px, baja resolución → pedirle el archivo original al dueño).

## Datos de EJEMPLO (confirmar con él antes de mostrar como definitivos)
- Precios de Mango $3.290, Maracuyá $3.290, Clamato Tajín $3.490, Pincho de camarón $3.990.
- "Combo Rey: michelada + completo $4.990" y que hoy sea "viernes".
- Horario "abierto hasta 03:00" para cada local (puede variar por local).
- El número **31** de locales (dato que dio él; en prensa figuran 21–25 a mediados de 2026).
- Nombres/etiquetas de las opciones del menú, y el aviso al "encargado REY I".

Todo esto está en el bloque `M` / `CAPTIONS` del HTML: se cambia el texto y se vuelve a renderizar.

---
## v2 (2026-10-05): fotos de comida y micheladas
- La carta pasó de lista de texto a **carrusel con fotos** (Michelada Clásica $2.990 · Con pincho de camarón · "15 tipos de michelada" · Nachos) y la promo del día lleva un banner con foto de micheladas. Duración 67 s (antes 61). Versión anterior: `_respaldo-v1.html` / `_respaldo-v1.mp4`.
- **Origen de las fotos (`assets/comida/`)**: recortes de fotos de prensa — The Clinic (diciembre 2025: las dos micheladas), 24horas (la fila de 5 micheladas) y BioBioChile (nachos). Se ven los vasos oficiales con su logo, pero **son fotos de terceros**: sirven para esta demo privada, **pero antes de publicarlas o usarlas en redes hay que reemplazarlas por fotos propias del Rey** (basta cambiar los archivos con el mismo nombre y re-renderizar). Los nachos son de baja resolución.
- Precios de la carta con foto: solo la Michelada Clásica ($2.990) es real; camarón $3.990 y nachos $5.490 son de ejemplo.
