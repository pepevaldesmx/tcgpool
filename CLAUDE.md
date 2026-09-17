# TCG Pool — contexto del proyecto

## Qué es y por qué

Comparador/buscador de cartas TCG enfocado a tiendas
mexicanas (LGS). Hoy, un jugador que busca una carta tiene que entrar tienda por
tienda (cada buscador ve sólo su propio inventario), hojear carpetas en una
convención, o preguntar en el chat de una tienda a ver si alguien contesta.

**El problema principal no es comparar precio: es que el stock de cualquier
tienda o vendedor individual, por sí solo, es demasiado bajo.** Nadie agrega la
oferta dispersa de varias tiendas en un solo lugar buscable. La comparación de
precio es real (los precios entre tiendas mexicanas no son copy-paste de
TCGPlayer, hay variación) pero es secundaria a la disponibilidad.

No hay competidor real. El único que lo intenta (TCGmercado) es una landing
vacía sin listings. Varias tiendas (MTG Wolf, Yellow Rabbit, MTG México, Tao
Games) tienen buscador de decklist, pero nunca cruzan con otras tiendas.

**Criterio de éxito de la demo:** pararse frente a un dueño de tienda, buscar
una carta que sabemos repartida entre 2–3 tiendas mexicanas, y que salga en
segundos algo que él no puede ver hoy en ningún lado.

## Fases

**Fase 1 (lo que existe en este repo):** agregar el catálogo de varias tiendas
establecidas en un buscador.

**Fase 2 (NO construir todavía):** afiliados. Un jugador con colección propia se
certifica como vendedor a través de una tienda que lo avala; cada tienda tiene
panel de afiliados con sus propias condiciones; el afiliado lleva la carta a la
tienda y ésta la manda con sus pedidos; comisión ~1% incrustada en el flujo de
pago, con umbral de volumen.

El modelo de datos ya lo soporta: `sellers` está separado de `stores` desde
ahora. **Al tocar el esquema, no colapses esa separación.**

## Fuera de alcance del MVP

Pagos, checkout, carrito, cuentas de usuario, login, comisiones, afiliados P2P,
app móvil nativa. Web responsive es suficiente.

## Invariantes técnicas

- **`card → printing → listing` son tres niveles distintos.** Una carta tiene
  muchas impresiones (set + número + idioma + foil); cada impresión, muchos
  listings de tiendas distintas. No los colapses.
- **Todo el SQL del catálogo vive en `src/lib/db/queries.ts`.** Las pantallas no
  hablan con Postgres directo.
- **El catálogo vive en Postgres, no en un archivo.** Fue SQLite reconstruido en
  cada build hasta que las tiendas empezaron a administrar su inventario,
  sincronizarse solas y manejar afiliados: todo eso son escrituras en runtime, y
  el filesystem de la función serverless es inmutable. Consecuencias que no hay
  que deshacer: el build ya no toca la base (`npm run build` es sólo
  `next build`), el cron escribe directo a Postgres y ya no commitea snapshots,
  y `data/snapshots/*.live.json` es evidencia de una corrida, no fuente de
  verdad.
- **Sin `DATABASE_URL` la app no inventa datos: lo dice.** El layout corta con
  `NotConfigured` en vez de dejar que cada página truene con un 500.
- **La ingesta escribe POR LOTES** (`upsertCards`, `upsertPrintings`,
  `upsertListings`). Una tienda real trae decenas de miles de listados: fila por
  fila serían cien mil viajes de red contra una base remota. Con SQLite local no
  importaba; aquí es la diferencia entre 19 segundos y media hora.
- **`listings.origin` separa lo que vino del feed de lo capturado a mano.** La
  sincronización sólo marca sin stock lo que tiene `origin = 'feed'`: si barriera
  todo, cada corrida borraría lo que la tienda capturó en su panel o lo que subió
  un afiliado.
- **La importación NO pisa lo que la tienda capturó a mano; levanta una
  advertencia.** Cuando el feed trae la misma impresión, en la misma condición,
  que un listado `origin='manual'` de esa tienda, ese renglón del feed NO entra
  a `listings` —entraría y la misma carta de la misma tienda saldría dos veces,
  con dos precios— y se guarda en `listing_conflicts`. La tienda decide caso por
  caso: `feed` copia los valores de Shopify al listado y lo devuelve al control
  de la importación; `manual` archiva la advertencia. Una advertencia ya resuelta
  no se reabre si el feed sigue diciendo lo mismo, pero sí si cambió: eso es una
  discrepancia nueva. La detección es `splitFeedByConflicts`, función pura sobre
  llaves, para poder probarla sin base.
- **La búsqueda es `tsvector` con prefijo por palabra, y trigramas de respaldo.**
  `to_tsquery('simple', 'sol:* & ring:*')` reproduce lo que hacía FTS5; cuando no
  hay coincidencia, `pg_trgm` tolera errores de dedo ("counterspel" encuentra
  Counterspell). `match_key` se normaliza en JS para no depender de `unaccent`,
  que no todos los Postgres administrados traen.
- **Una fuente de datos = un adaptador** en `src/lib/ingest/adapters/`, que
  devuelve `RawListing[]`. Sumar una tienda Shopify no debe requerir código.
- **`npm run build` tiene que funcionar sin red y sin base.** El build no
  consulta Postgres; la ingesta resuelve nombres contra la caché versionada
  `data/scryfall-cache.json`.
- **Nunca presentes datos de muestra como reales, ni al revés.** La procedencia
  es POR TIENDA (`stores.data_source`, que la ingesta escribe con el origen real
  del feed, no con el modo del script). `getProvenance()` devuelve los números y
  la UI los dice: el aviso cuenta cuántas tiendas son reales y cada listado de
  una tienda en muestra lleva su marca `demo`. Un booleano global mentía en los
  dos sentidos.
- **Hoy el catálogo es SÓLO Magic** (`GAMES` en `src/lib/games.ts`). Primero se
  prueba el sistema entero con el único juego que tiene catálogo canónico
  (Scryfall) contra el cual resolver nombres; los demás están en `FUTURE_GAMES`.
  Detectar no es aceptar: se siguen detectando todos —si no, el Digimon de una
  tienda de Magic entraría como Magic— y `normalizeListing` descarta los que no
  están prendidos. Sumar un juego es moverlo de `FUTURE_GAMES` a `GAMES` y
  volver a sincronizar; `pruneGamesNotIn` limpia el catálogo en cada corrida.
- **El juego se detecta POR PRODUCTO, no por tienda.** Las tiendas reales venden
  varios TCG y lo declaran en `product_type` ("MTG Single", "Yugioh Single",
  "Pokemon Sealed"). `classifyProduct` lo usa como señal principal; el
  `defaultGame` de la tienda es sólo el respaldo. Sin esto, el Yu-Gi-Oh de una
  tienda de Magic entra al catálogo de Magic. Scryfall sólo resuelve Magic.
  Ese respaldo aplica a productos que NO nombran juego ("Cartas Sueltas"),
  nunca a los que nombran uno que no soportamos: `namesUnsupportedGame` los
  descarta, porque "Star Wars Single" en una tienda de Magic no es Magic.
- **El registro de tiendas manda: `data/stores.json` es la fuente.** Quitar una
  tienda de ahí la borra de la base en el siguiente sync (`pruneStoresNotIn`),
  con sus listados y las cartas que se quedan sin ninguno. El SQL del catálogo
  no filtra por tienda activa, así que dejarla "inactiva" no la sacaría del
  buscador.
- **Un feed cortado a la mitad se ingiere, pero NO barre agotados.** Una página
  que falla después de reintentos devuelve lo que alcanzó marcado como
  `partial`: tirar 3,500 productos ya descargados por un 500 pasajero deja a la
  tienda entera fuera del buscador. Con feed parcial no corre
  `markMissingAsOutOfStock` —lo ausente puede estar en las páginas que no
  llegaron— ni se sobrescribe el snapshot completo anterior.
- **Los snapshots se guardan normalizados** (`normalizeFeed`): sólo los campos
  que la ingesta usa, ordenados de forma estable. El feed crudo de Shopify trae
  `body_html` y timestamps volátiles, y hacía que el cron reescribiera 35 MB
  cada 6 horas aunque nada hubiera cambiado.
- **El look vive en tokens semánticos** definidos en el bloque `@theme` de
  `src/app/globals.css`: color (`paper`, `surface`, `line`, `ink`, `accent`,
  `ok`, `warn`), forma (`radius-card`, `radius-control`, `radius-pill`,
  `shadow-card`, `shadow-lift`) y tipografía. Las pantallas nunca usan valores
  literales —ni colores, ni radios, ni sombras— así que cambiar de piel es
  reescribir ese bloque.
  Sistema actual: estructura de marketplace (redondeo de 12px, sombra suave y
  fría, aire generoso, píldoras en botones y chips, base de 15px) sobre paleta
  de papel gris azulado, tinta azul marino y turquesa profundo como único
  acento. Una sola familia sans para todo: la jerarquía la hacen peso y tamaño.
- **Agotado no es catálogo.** Las tiendas dejan publicado lo que ya no tienen
  —95% de los listados ingeridos—, y un buscador que lo muestra le hace perder
  el tiempo al comprador igual que el sitio de la tienda. Se INGIERE todo (que
  una tienda la maneje es señal: a quién preguntarle, qué esperar) pero se
  MUESTRA sólo lo comprable: `searchCards` filtra por stock salvo que se pida lo
  contrario, y "N tiendas" cuenta tiendas donde se puede comprar hoy, no tiendas
  que la listan. Las que la tienen agotada van aparte y en chico.
- **NO ponemos a las tiendas a competir por precio.** Nada de coronar "la más
  barata", ni de anunciar la diferencia porcentual entre tiendas. El precio se
  muestra y se puede ordenar por él, pero nunca es el ranking por defecto:
  ocultarlo sería deshonesto con el comprador, premiarlo convierte a las tiendas
  en rivales. Lo que se premia es la COBERTURA — quién surte más de lo que el
  usuario busca— porque el problema real siempre fue la disponibilidad y porque
  el objetivo es concentrar el pedido en las menos tiendas posibles.
- **La ubicación vive en una cookie, no en el estado del cliente.** La vista de
  carta y el plan de surtido se calculan en el SERVIDOR; con la ubicación sólo
  en el navegador habría que reordenar tras hidratar, con parpadeo, y el plan
  jamás podría tomarla en cuenta. Se guarda redondeada a ~1 km: las coordenadas
  de las tiendas son el centro de su ciudad, así que más precisión no mejora
  nada y sería recolectar ubicación fina sin necesitarla. La cookie es entrada
  no confiable: `parseLocation` valida y devuelve null ante basura.
- **El criterio de cercanía es MISMA CIUDAD antes que kilómetros**
  (`proximityRank`). Es la única diferencia que el comprador siente —recoger en
  tienda, envío al día siguiente—; entre dos ciudades distintas todo es
  paquetería y 300 o 600 km dan casi lo mismo. Con ubicación, la cercanía es el
  orden por defecto de los listados; sin ella, la tienda. Nunca el precio.
- **`planFulfillment` es cubrimiento de conjuntos voraz**, no optimización de
  precio: elige la tienda que agrega más cartas nuevas y desempata por costo.
  Partir la compra entre seis tiendas para ahorrar unos pesos sale peor en
  envíos y esperas, y es justo lo que no queremos empujar.
- **Dos motores de búsqueda, no uno**: carta suelta (`/buscar`) y lista pegada
  (`/lista`, que responde "qué tienda cubre más de tu lista"). El segundo es el
  que las tiendas ya ofrecen sobre su propio inventario; el valor está en
  cruzarlo entre tiendas.
- La UI está en español mexicano; los nombres de carta se quedan en inglés
  porque así los titulan las tiendas.

## Comandos

```bash
npm run dev                                 # servidor de desarrollo
npm run db:migrate                          # aplica el esquema (idempotente)
npm run sync                                # ingerir desde data/snapshots/
npm run sync -- --live [--store=<slug>]     # ingerir feeds reales
npm run snapshot -- --store=<slug>          # capturar un feed sin ingerirlo
npm run make-samples                        # regenerar datos de muestra (usa Scryfall)
npm run snapshots:normalize                 # reescribir snapshots en forma estable
npm run typecheck
npm test
```

## Stack

Next.js (App Router) + PostgreSQL (`pg`) + Tailwind, desplegado en Vercel.
Una sola base para catálogo y señales de demanda, con `DATABASE_URL` como única
configuración. El build no la toca: sólo compila. La ingesta corre aparte (cron
de GitHub Actions) y escribe directo a la base.
