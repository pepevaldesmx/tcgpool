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
- **El número de colección y el acabado NO son parte del nombre de la carta.**
  Las tiendas titulan "Command Tower (0233) (Surge Foil) [Marvel...]", y dejar
  cualquiera de esos paréntesis pegado al nombre convertía UNA carta en seis
  cartas distintas: el buscador la partía en pedazos y el cruce entre tiendas
  —la razón de existir del producto— dejaba de funcionar para ella. `parseTitle`
  pela los paréntesis del final uno por uno: número de colección a la impresión,
  tratamiento a la basura, y sólo lo que no reconoce se queda como nombre o set.
  Un paréntesis con puros dígitos NUNCA es el nombre del set. Arreglar el parser
  no basta: `pruneOrphans` corre en cada sincronización completa para que las
  cartas mal partidas de antes, que se quedan sin listados, salgan del catálogo.
- **`cards` es el catálogo de Magic COMPLETO, no el inventario.** Se siembra de
  los datos masivos de Scryfall (`npm run catalog:seed`, ~33,000 nombres) porque
  resolver nombres contra la red no escala: la ingesta pagaba 150 ms por nombre
  —diez minutos por tienda— y un CSV de mil renglones no cabría en una petición
  web. Con el catálogo sembrado se resuelve en memoria y sin red; Scryfall queda
  para lo que no está. Consecuencia que NO hay que deshacer: "N cartas" en la UI
  cuenta cartas que alguien vende, nunca filas de `cards`, y `searchCards`
  esconde las que nadie lista (el panel las pide con `includeUnlisted`, porque
  capturar lo que nadie tiene es justo su trabajo).
- **Quién es una carta lo decide el catálogo, no una lista de palabras.** Las
  tiendas cuelgan "(Pro Tour)", "(Promo Pack)", "(Oversized)" y lo que se les
  ocurra mañana; perseguirlas con un regex es una carrera perdida.
  `resolveAgainstCatalog` recorta paréntesis del final hasta que el catálogo
  reconoce el nombre, de la versión más larga a la más corta —"Erase (Not the
  Urza's Legacy One)" ES una carta y recortarla de más la cambiaría por otra— y
  si nada empata, no inventa.
- **Toda tienda sabe exportar un CSV; no toda tiene API.** El importador de
  `/tienda/<slug>` es el conector que no exige que la tienda corra nada en
  particular, y el único que desbloquea a las que no tienen feed. Se importa
  SIEMPRE en dos tiempos: primero se lee y se enseña qué se entendió —cuántas
  reconocidas, cuáles no— y sólo después se escribe. Importar mil renglones a
  ciegas y avisar del resultado es como una tienda pierde la confianza en un
  solo movimiento. Los nombres que no se reconocen se REPORTAN, nunca se
  adivinan. El CSV se lee con `parseCsv` y no con `split(",")`: los nombres de
  carta traen comas y comillas de verdad ("Jaya, Fiery Negotiator"), y partir
  por comas los convierte en basura silenciosa.
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
- **Un listado capturado a mano SUPLANTA al del feed** para esa misma impresión
  y condición (`supersedeFeedListings`). No basta con no actualizarlo: si una
  corrida anterior ya lo había publicado, quedaban los dos y la misma carta de
  la misma tienda salía dos veces con dos precios. Los valores del feed no se
  pierden —viven en la advertencia— y vuelven si la tienda decide que gana él.
  Resolver a favor del feed BORRA el capturado y publica el del feed como
  listado nuevo; renombrar el capturado con el `external_id` del feed reventaba
  la llave única cuando otra fila ya lo tenía.
- **El panel de tienda se abre con `stores.panel_token`,** no con cuentas. Quien
  tiene el link entra; el token se compara contra la base y las acciones lo
  revalidan además contra el slug, porque si no, cambiar una palabra en la URL
  editaría el inventario de otra tienda. Token inválido y tienda inexistente dan
  el mismo 404: distinguirlos confirmaría cuáles existen. El panel no se indexa.
- **El precio de referencia sale de Scryfall, que republica TCGplayer bajo
  licencia.** Es la misma referencia con la que las tiendas mexicanas fijan sus
  precios, pero obtenida por una vía que no se puede cortar: scrapear TCGplayer
  o StarCityGames violaría sus términos y dejaría la plataforma parada el día
  que lo noten. Se pide por impresión concreta —set y número de colección— y se
  degrada avisando: si sólo se pudo empatar por nombre, la UI dice que el precio
  puede ser de otra edición. Nunca se sustituye el precio de un acabado por el
  de otro: una impresión sin foil no tiene precio foil, y rellenarlo con el de
  la no-foil sería inventarlo.
- **El tipo de cambio es el de hoy, y cuando no lo es, se dice.** Quemarlo en el
  código lo deja envejecer en silencio y sugerir precios mal sin que nadie lo
  note. `usdToMxn` lo consulta, lo valida contra una banda de cordura (8–60: una
  respuesta corrupta convertiría una carta de dos dólares en diez mil pesos) y
  cae a `MXN_POR_USD` o a un respaldo DECLARANDO cuál usó. En el panel es un
  campo con flechas de diez centavos, no un número fijo: la tienda lo sube para
  cubrir importación y margen —así es como ya fija sus precios— y la aritmética
  completa queda a la vista (`US$1.57 × 18.5 = $29.05`). El precio que se
  publica es el que quedó en el campo, no una fórmula que se recalcule sola: si
  se recalculara, el catálogo entero se movería con el dólar sin que la tienda
  lo decidiera.
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
npm run catalog:seed                        # siembra las ~33,000 cartas de Magic
npm run db:check                            # diagnostica DATABASE_URL sin revelarla
npm run smoke                               # reporte del catálogo real (sólo lectura)
npm run probe -- <dominio>                  # ¿ese dominio sirve un feed de Shopify?
npm run panel:token -- --store=<slug>       # link del panel de esa tienda
npm run typecheck
npm test
```

Producción: <https://tcgpool.vercel.app>. Los workflows de GitHub Actions
(`sync`, `smoke`, `probe`) corren con el secreto `DATABASE_URL` del repositorio:
son la única vía para tocar la base desde donde no se tiene la cadena.

## Stack

Next.js (App Router) + PostgreSQL (`pg`) + Tailwind, desplegado en Vercel.
Una sola base para catálogo y señales de demanda, con `DATABASE_URL` como única
configuración. El build no la toca: sólo compila. La ingesta corre aparte (cron
de GitHub Actions) y escribe directo a la base.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
