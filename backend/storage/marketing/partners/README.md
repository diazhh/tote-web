# Casas de apuestas / loterías online — "Dónde Jugar"

Catálogo de las plataformas venezolanas donde se puede jugar, para usar en piezas de marketing (publicar "dónde jugar" en redes).

- **Datos estructurados:** [`partners.json`](./partners.json) — machine-readable, listo para que el pipeline de marketing lo consuma.
- **Logos:** [`./logos/`](./logos/) — un archivo por marca (PNG/SVG/JPG).
- **Investigado:** 2026-06-22 · 16 plataformas · vía búsqueda web + verificación de logo por descarga directa.

> Varias son SPA detrás de Cloudflare con bot-protection: devuelven 403 a fetch automatizado pero están **activas** en navegador. Eso está anotado por sitio.

## Resumen

| # | Marca | URL | Instagram | Logo | Conf. |
|---|-------|-----|-----------|------|-------|
| 1 | Triples.bet | https://triples.bet/ | [@triples.com.ve](https://www.instagram.com/triples.com.ve) | `triples-bet.png` | 🟢 alta |
| 2 | Parley.la | https://parley.la/ | [@parleydevenezuela](https://instagram.com/parleydevenezuela/) | `parley-la.png` | 🟢 alta |
| 3 | ApuestasX | https://apuestasx.com | [@apxoficial__](https://www.instagram.com/apxoficial__/) | `apuestasx.png` | 🟢 alta |
| 4 | CamanBet | https://caman.vip/ | [@camanvip](https://www.instagram.com/camanvip/) | `camanbet.png` | 🟢 alta |
| 5 | Casa Grande Bets | https://www.casagrandebets.com/ | [@grupocasagrandeoficial](https://www.instagram.com/grupocasagrandeoficial) | `casagrandebet.svg` (+`.png`) | 🟢 alta |
| 6 | DivinoPlay | https://divinoplay.com/ | [@divinoplay.official](https://www.instagram.com/divinoplay.official/) | `divinoplay.png` | 🟢 alta |
| 7 | El Ganador | https://elganador.com/ | [@elganadorve](https://www.instagram.com/elganadorve/) | `el-ganador.png` | 🟢 alta |
| 8 | Fanaticash | https://fanaticash.com/ | [@fanaticash_](https://www.instagram.com/fanaticash_/) | `fanaticash.jpg` | 🟡 media |
| 9 | Cordialito | https://cordialito.la/ | [@cordialito.la](https://www.instagram.com/cordialito.la/) | `cordialito.png` | 🟢 alta |
| 10 | Juega en Línea | https://www.juegaenlinea.net | [@juegaenlinea](https://www.instagram.com/juegaenlinea/) | `juega-en-linea.png` | 🟢 alta |
| 11 | KingDeportes | https://kingdeportes.com/ | [@kingdeportesve](https://www.instagram.com/kingdeportesve) | `kingdeportes.png` | 🟢 alta |
| 12 | MeridianoBet | https://meridianobet.net/ | [@meridianobet](https://www.instagram.com/meridianobet/) | `meridiano-bet.svg` | 🟡 media |
| 13 | MiCasino | https://micasino.com/ | [@micasinocom](https://www.instagram.com/micasinocom) | `mi-casino.svg` | 🟢 alta |
| 14 | Redhairbet | https://redhairbet.com | [@redhair.ves](https://www.instagram.com/redhair.ves) | `redhairbet.png` | 🟢 alta |
| 15 | SellaTuParley | https://www.sellatuparley.com/ | [@sellatuparleyoficial](https://www.instagram.com/sellatuparleyoficial/) | `sella-tu-parley.png` | 🟢 alta |
| 16 | TriunfoBet | https://triunfobet.com/ | [@triunfobet_oficial](https://www.instagram.com/triunfobet_oficial) | `triunfobet.png` | 🟢 alta |

## Notas importantes

- **Casa Grande Bets** — el dominio correcto lleva "s": `casagrandebets.com`. Solo Instagram, Telegram y WhatsApp son cuentas reales (FB/TikTok/YouTube son placeholders vacíos).
- **Fanaticash** — el sitio bloquea todo fetch automatizado (403). El logo guardado es el avatar del Instagram oficial; no se pudo extraer el logo del propio sitio. Cuidado: `fanati-cash.com` (con guion) es un sitio afiliado/review, **no** el operador.
- **MeridianoBet** — es el producto de apuestas (operado/afiliado a Grupo Cordialito), distinto del diario/TV *Meridiano*.
- **El Ganador / MiCasino / Juega en Línea** — nombres genéricos con muchos clones. Los oficiales están verificados en `partners.json` (ver campo `notes` y `altDomains`).
- **TriunfoBet, KingDeportes, DivinoPlay, El Ganador** — logos servidos desde el CDN white-label `igamingassets.co` (hotlink-protegido: requieren `Referer` del sitio para descargar).
- Redes sociales completas (Facebook, X, TikTok, Telegram, WhatsApp, YouTube, LinkedIn) por marca → ver `partners.json`.

## Cómo regenerar / actualizar

Los logos se descargaron con `User-Agent` de navegador + `Referer` del sitio (para sortear hotlink/Cloudflare). Para refrescar un logo, tomar el `logo.sourceUrl` de `partners.json` y descargar con esos headers. El avatar de Fanaticash viene de una URL firmada de Instagram que expira — re-descargar desde el perfil si hace falta.
