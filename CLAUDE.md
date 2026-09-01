# TCG Pool — contexto del proyecto

## Qué es y por qué

Comparador/buscador de cartas TCG (Magic, Pokémon, Yu-Gi-Oh) enfocado a tiendas
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
- **Todo el SQL vive en `src/lib/db/queries.ts`.** La app no habla con SQLite
  directo. Migrar a Postgres debe ser reescribir ese archivo, no la app.
- **`src/lib/db/index.ts` no toca `fs`.** Next traza los accesos a disco para
  empaquetar las funciones serverless; el acceso a archivos vive en
  `src/lib/db/migrate.ts`, que sólo usan los scripts.
- **En runtime la base se abre en SÓLO LECTURA y nunca en WAL.** El filesystem
  de la función serverless es inmutable: abrirla en modo escritura o fijar
  `journal_mode = WAL` tira "attempt to write a readonly database" en cada
  request. `openForWrite` deja el archivo en `journal_mode=delete` y `db:build`
  falla si sale en WAL.
- **Una fuente de datos = un adaptador** en `src/lib/ingest/adapters/`, que
  devuelve `RawListing[]`. Sumar una tienda Shopify no debe requerir código.
- **`npm run build` tiene que funcionar sin red.** `db:build` resuelve nombres
  contra la caché versionada `data/scryfall-cache.json`.
- **Nunca presentes datos de muestra como reales.** Mientras no haya un
  `sync_run` con `source='live'`, la UI muestra el banner de demostración
  (`isSampleData()`).
- **El look vive en tokens semánticos** (`paper`, `surface`, `line`, `ink`,
  `accent`, …) definidos en el bloque `@theme` de `src/app/globals.css`. Las
  pantallas nunca usan colores literales: cambiar de piel es reescribir ese
  bloque. Paleta actual: papel gris azulado, tinta azul marino, turquesa
  profundo como único acento, titulares con serif.
- **Dos motores de búsqueda, no uno**: carta suelta (`/buscar`) y lista pegada
  (`/lista`, que responde "qué tienda cubre más de tu lista"). El segundo es el
  que las tiendas ya ofrecen sobre su propio inventario; el valor está en
  cruzarlo entre tiendas.
- La UI está en español mexicano; los nombres de carta se quedan en inglés
  porque así los titulan las tiendas.

## Comandos

```bash
npm run dev                                 # servidor de desarrollo
npm run db:build                            # reconstruir data/tcgpool.db
npm run sync                                # ingerir desde data/snapshots/
npm run sync -- --live [--store=<slug>]     # ingerir feeds reales
npm run snapshot -- --store=<slug>          # capturar un feed sin ingerirlo
npm run make-samples                        # regenerar datos de muestra (usa Scryfall)
npm run typecheck
```

## Stack

Next.js (App Router) + SQLite (better-sqlite3) + Tailwind. Deploy pensado para
Vercel: la base es de sólo lectura en runtime y se reconstruye en cada build
desde los snapshots commiteados. Si el catálogo crece a cientos de miles de
listings o hace falta escribir en runtime (fase 2), toca migrar a Postgres —
por eso todo el SQL está aislado.
