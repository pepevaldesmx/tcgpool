# TCG Pool — comparador de cartas TCG en tiendas mexicanas

Buscador que agrega el catálogo de varias tiendas mexicanas (LGS) en un solo
lugar: escribes el nombre de una carta y ves **quién la tiene**, en qué
versión, condición e idioma, a qué precio y si hay stock — con link directo al
producto en la tienda original.

El problema que resuelve no es principalmente comparar precio: es que el stock
de cualquier tienda por sí sola es demasiado bajo, y hoy nadie agrega la oferta
dispersa en un solo lugar buscable.

**Producción:** <https://tcgpool.vercel.app>

> **Estado: MVP demostrable.** Falta pagos, cuentas y el modelo de afiliados
> (fase 2). El objetivo es poder pararse frente a un dueño de tienda y enseñarle
> algo que él no puede ver hoy en ningún lado.

## Arrancar

El catálogo vive en Postgres. Hacen falta una base y dos comandos:

```bash
npm install
export DATABASE_URL=postgres://...   # Supabase, Neon, o uno local
npm run db:migrate                   # aplica el esquema (idempotente)
npm run sync                         # carga el catálogo desde data/snapshots/
npm run dev                          # http://localhost:3000
```

`npm run build` **no** toca la base: sólo compila. Sin `DATABASE_URL` la app no
truena — muestra una pantalla que explica qué falta.

### La base en Supabase

Cualquier Postgres 14+ sirve —el código es `pg` y SQL estándar, sin nada
propietario— pero el proyecto está pensado para Supabase, porque la fase que
sigue (paneles de tienda) necesita autenticación y ahí viene incluida.

1. Crea el proyecto en [supabase.com](https://supabase.com) y elige la región
   más cercana a México (`us-east-1` o `us-west-1`).
2. Copia la cadena del **connection pooler**, no la directa:
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`.
   La directa (`db.<ref>.supabase.co:5432`) sólo responde por IPv6 en el plan
   gratuito, y las funciones serverless de Vercel salen por IPv4: con ella los
   deployments truenan con `ENETUNREACH`.
3. Ponla como `DATABASE_URL` en tres lugares: tu `.env.local`, las variables de
   entorno del proyecto en Vercel, y los secretos del repositorio en GitHub
   (los usa el cron de sincronización).
4. `npm run db:migrate && npm run sync -- --live`.

`db:migrate` crea la extensión `pg_trgm`, que es la que sostiene la búsqueda
difusa; en Supabase viene disponible sin pedir permisos extra.

Dos cosas que muerden: los proyectos gratuitos **se pausan tras ~una semana sin
actividad** (el cron de 6 horas basta para mantenerlo despierto, pero si lo
apagas hay que reanudar el proyecto a mano antes de una demo), y el pooler en
modo transacción no admite sentencias preparadas — por eso `src/lib/db/index.ts`
nunca les pone nombre.

## Datos

El repo trae **feeds de muestra** en `data/snapshots/*.sample.json`, con la
forma exacta de `/products.json` de Shopify:

- Las **cartas son reales**: nombres, sets, números de colección e imágenes
  vienen de [Scryfall](https://scryfall.com).
- Los **precios, condiciones y stock son sintéticos**, y la UI lo advierte
  mientras no se haya ingerido un feed real (banner "Datos de demostración").

Para cambiarlos por catálogo real:

```bash
npm run sync -- --live                      # todas las tiendas
npm run sync -- --live --store=mtg-mexico   # una sola
npm run snapshot -- --store=mtg-mexico      # sólo capturar el feed, sin ingerir
```

`--live` pega a `https://<tienda>/products.json`, escribe el catálogo en
Postgres y deja el feed normalizado en `data/snapshots/<slug>.live.json` como
evidencia de la corrida. Ese archivo **no se commitea**: la base es la fuente de
verdad, y commitearlo inflaba el repo 11 MB cada 6 horas.

> ⚠️ Antes de agregar una tienda, confirma su dominio con
> `npm run probe -- <dominio>` (o el workflow "Probar dominios de tiendas", que
> sirve desde una red que no alcanza esos hosts). Dice si responde, a dónde
> redirige, si expone `/products.json` y qué juegos declara en `product_type`.
> Los que quedan con `"domainVerified": false` no se han podido confirmar.

### Señales de demanda (cartas de moda)

El home muestra "cartas de moda" = **las más buscadas que además están
disponibles**. Esa señal se escribe en runtime, en la misma base que el catálogo
(la tabla `card_events`, que `db:migrate` crea junto con todo lo demás).

Se llavea por **slug**, no por id: los ids se regeneran si alguna vez se
reconstruye el catálogo desde cero, y los contadores tienen que sobrevivir a
eso. **Sin `DATABASE_URL` la app funciona igual**: el home cae al ranking de
oferta y lo dice —"Todavía no medimos búsquedas: por ahora, las que más tiendas
tienen en stock"— en lugar de fingir popularidad.

Qué se mide y qué no: se registran vistas de carta y **clics de salida** hacia
la tienda; el clic pesa el triple porque es la intención de compra más cercana
que podemos observar. La venta NO se puede medir — en fase 1 el checkout ocurre
en la tienda y nunca la vemos.

### Deploy

Producción: <https://tcgpool.vercel.app>

El proyecto está enlazado a Vercel como `tcgpool`, bajo la cuenta personal —no
bajo el equipo `PPVAPPS`, que sólo tiene otro proyecto—: cada
push genera un deployment — preview en ramas, producción en la rama de
producción. Lo único que hay que configurar en el dashboard es `DATABASE_URL`.

El build **no** toca la base: compila y ya. Actualizar el catálogo es correr la
ingesta contra Postgres, no redesplegar — la app lee la base en cada request,
así que un `sync` se ve reflejado sin build de por medio.

Cada función serverless abre **una** conexión (`PGPOOL_MAX=1`): el cupo del
pooler se agota rapidísimo si cada invocación abre varias. Los scripts de
ingesta, que corren en un solo proceso, suben ese número por variable de
entorno.

### Sincronización periódica

`.github/workflows/sync.yml` corre `--live` cada 6 horas y escribe directo a
Postgres, con `DATABASE_URL` como secreto del repositorio. No commitea nada y no
dispara deploys: la app lee la base en cada request.

## Cómo está armado

```
src/
  app/                     Next.js (App Router)
    page.tsx               home + buscador + cartas repartidas entre tiendas
    buscar/                resultados de búsqueda
    lista/                 pega una decklist: qué tienda cubre más y a qué costo
    carta/[slug]/          LA vista: todos los listings de una carta, con filtros
    tiendas/               tiendas conectadas y frescura de cada sync
    api/sugerencias/       autocomplete
  lib/
    db/schema.sql          modelo de datos (ver abajo)
    db/queries.ts          TODO el SQL vive aquí
    ingest/
      registry.ts          lee data/stores.json
      adapters/shopify.ts  feed público /products.json
      adapters/manual.ts   tiendas sin feed (MTG Wolf corre en Wix)
      normalize.ts         título de tienda -> carta + set + idioma + foil + condición
      run.ts               orquesta: fetch -> normaliza -> resuelve -> upsert
    cards/scryfall.ts      nombre canónico + imagen
    decklist.ts            parser de listas pegadas (Moxfield, Archidekt, a mano)
    fulfillment.ts         qué tiendas cubren una lista en el menor número de pedidos
    location.ts            ubicación del usuario en cookie + criterio de cercanía
    games.ts               catálogo de juegos y detección por product_type
    trending.ts            "cartas de moda": demanda real, con respaldo por oferta
    events/store.ts        contadores de demanda (escritura en runtime)
scripts/
  db-migrate.ts            aplica el esquema a Postgres
  sync.ts                  job de sincronización
  snapshot.ts              captura un feed sin ingerirlo
  make-samples.ts          regenera los datos de muestra
```

### Modelo de datos

```
stores      tienda física/online + qué adaptador la ingiere
sellers     VENDEDOR, separado de la tienda a propósito (ver abajo)
cards       la carta abstracta ("Sol Ring")
printings   una impresión concreta: set + número + idioma + foil
listings    lo que un vendedor tiene a la venta de esa impresión
sync_runs   bitácora de cada sincronización
```

Los tres niveles `card → printing → listing` no se colapsan: una carta tiene
muchas impresiones y cada impresión muchos listings de tiendas distintas. Es lo
que permite decir "cuatro tiendas la tienen, pero sólo dos en Ravnica foil".

`sellers` existe desde ahora aunque en fase 1 todo vendedor sea de tipo
`store`: en fase 2, un jugador certificado por una tienda entra como
`type='affiliate'` con `store_id` apuntando a la tienda que lo avala y le da
logística — sin rediseñar el esquema ni la ingesta.

### La pieza difícil: normalización

Cada tienda escribe los títulos a su manera:

```
"Lightning Bolt (Foil) [Marvel Super Heroes Commander]"   MTG México
"Lightning Bolt (Ravnica: Clue Edition)"                  Yellow Rabbit
"Lightning Bolt - Double Masters 2022 - Foil"             otra tienda
```

`src/lib/ingest/normalize.ts` saca de ahí nombre, set, idioma, acabado y
condición, y descarta sellado y accesorios. Después `cards/scryfall.ts` resuelve
el nombre contra el catálogo canónico (por nombre exacto primero: con búsqueda
difusa, "Swords to Plowshares" cae en cartas partidas). Sin ese paso, la misma
carta aparecería tres veces, una por tienda, y no habría comparador.

Los feeds de muestra incluyen productos de ruido (booster boxes, micas,
playmats) precisamente para ejercitar ese filtro.

## El panel de tienda

Cada tienda administra su inventario en `/tienda/<slug>`, con un link secreto:

```bash
PANEL_BASE_URL=https://tcgpool.vercel.app npm run panel:token -- --store=mtg-mexico
npm run panel:token -- --store=mtg-mexico --rotar   # revoca el link anterior
```

Sin cuentas todavía: quien tiene el link entra. El token se compara contra la
base y las acciones lo revalidan **también** contra el slug de la URL — si no,
cambiar una palabra en la dirección editaría el inventario de otra tienda. Un
token inválido y una tienda inexistente dan el mismo 404, para no confirmar
cuáles existen, y la página no se indexa.

Al elegir la versión de una carta, el panel muestra su imagen y un **precio de
referencia**: el de TCGplayer que [Scryfall](https://scryfall.com/docs/api)
republica bajo licencia, por impresión concreta, convertido a pesos con
`MXN_POR_USD` (por omisión 20). La aritmética se enseña completa —`US$1.57 × 20
= $31.40`— porque es una sugerencia que la tienda corrige, no un precio que le
imponemos. No scrapeamos TCGplayer ni StarCityGames: sus términos lo prohíben y
el acceso se puede cortar.

Ahí la tienda captura cartas a mano y resuelve las **diferencias con su tienda
en línea**: cuando la importación trae la misma impresión, en la misma
condición, que algo capturado a mano, lo capturado se queda publicado y el valor
del feed espera en una advertencia. La tienda decide caso por caso, y una
advertencia resuelta no se reabre mientras el feed siga diciendo lo mismo.

## Agregar una tienda

1. Nueva entrada en `data/stores.json`. Si corre en Shopify, con
   `"sourceType": "shopify"` y `"sourceConfig": { "domain": "..." }` basta.
2. `npm run sync -- --live --store=<slug>`.
3. Si no es Shopify: un adaptador nuevo en `src/lib/ingest/adapters/` que
   devuelva `RawListing[]`. El resto del pipeline no cambia.

## Fuera de alcance en este MVP

Pagos, carrito, cuentas de usuario, comisiones, app nativa y el modelo de
afiliados P2P. Web responsive es suficiente para la demo.
