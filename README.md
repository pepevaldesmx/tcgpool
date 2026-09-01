# TCG Pool — comparador de cartas TCG en tiendas mexicanas

Buscador que agrega el catálogo de varias tiendas mexicanas (LGS) en un solo
lugar: escribes el nombre de una carta y ves **quién la tiene**, en qué
versión, condición e idioma, a qué precio y si hay stock — con link directo al
producto en la tienda original.

El problema que resuelve no es principalmente comparar precio: es que el stock
de cualquier tienda por sí sola es demasiado bajo, y hoy nadie agrega la oferta
dispersa en un solo lugar buscable.

> **Estado: MVP demostrable.** Falta pagos, cuentas y el modelo de afiliados
> (fase 2). El objetivo es poder pararse frente a un dueño de tienda y enseñarle
> algo que él no puede ver hoy en ningún lado.

## Arrancar

```bash
npm install
npm run db:build     # construye data/tcgpool.db desde los snapshots versionados
npm run dev          # http://localhost:3000
```

`npm run build` ya corre `db:build`, así que en Vercel no hay nada extra que
configurar: cada deploy reconstruye la base a partir de lo que esté commiteado
en `data/snapshots/`.

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

`--live` pega a `https://<tienda>/products.json`, guarda el feed crudo en
`data/snapshots/<slug>.live.json` (que tiene prioridad sobre el `.sample.json`)
y lo ingiere. Los `.live.json` **se commitean**: son la fuente desde la que
Vercel reconstruye la base en cada deploy.

> ⚠️ Los dominios de `data/stores.json` marcados con `"domainVerified": false`
> se tomaron del brief o se dedujeron y **no se pudieron confirmar** desde el
> entorno donde se escribió esto (la política de red bloqueaba esos hosts).
> Verifícalos antes del primer `--live`. `mtgmexico.com` sí venía confirmado en
> el brief.

### Deploy

El proyecto está enlazado a Vercel (equipo `PPVAPPS`, proyecto `tcgpool`): cada
push genera un deployment — preview en ramas, producción en la rama de
producción. No hay nada que configurar en el dashboard, porque `npm run build`
reconstruye la base y `next.config.ts` incluye `data/tcgpool.db` en el trazado
de archivos de las funciones serverless.

En runtime la base es de **sólo lectura**: actualizar el catálogo es commitear
snapshots nuevos y redesplegar, no escribir en SQLite desde la app.

### Sincronización periódica

`.github/workflows/sync.yml` corre `--live` cada 6 horas y commitea los
snapshots; el push dispara el redeploy en Vercel. Para el MVP no hace falta
tiempo real ni colas de trabajos.

## Cómo está armado

```
src/
  app/                     Next.js (App Router)
    page.tsx               home + buscador + cartas repartidas entre tiendas
    buscar/                resultados de búsqueda
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
scripts/
  build-db.ts              reconstruye la base (corre en `npm run build`)
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
"Lightning Bolt - Double Masters 2022 - Foil"             Tao Games
```

`src/lib/ingest/normalize.ts` saca de ahí nombre, set, idioma, acabado y
condición, y descarta sellado y accesorios. Después `cards/scryfall.ts` resuelve
el nombre contra el catálogo canónico (por nombre exacto primero: con búsqueda
difusa, "Swords to Plowshares" cae en cartas partidas). Sin ese paso, la misma
carta aparecería tres veces, una por tienda, y no habría comparador.

Los feeds de muestra incluyen productos de ruido (booster boxes, micas,
playmats) precisamente para ejercitar ese filtro.

## Agregar una tienda

1. Nueva entrada en `data/stores.json`. Si corre en Shopify, con
   `"sourceType": "shopify"` y `"sourceConfig": { "domain": "..." }` basta.
2. `npm run sync -- --live --store=<slug>`.
3. Si no es Shopify: un adaptador nuevo en `src/lib/ingest/adapters/` que
   devuelva `RawListing[]`. El resto del pipeline no cambia.

## Fuera de alcance en este MVP

Pagos, carrito, cuentas de usuario, comisiones, app nativa y el modelo de
afiliados P2P. Web responsive es suficiente para la demo.
