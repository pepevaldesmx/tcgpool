/**
 * Siembra el catálogo de Magic desde los datos masivos de Scryfall.
 *
 *   npm run catalog:seed
 *
 * Hasta ahora la tabla `cards` sólo tenía lo que las tiendas conectadas
 * listaban, y eso rompe dos cosas:
 *
 *  1. Una tienda que sube su inventario por CSV trae cartas que no conocemos.
 *     Resolver cada nombre contra la API de Scryfall cuesta 150 ms —son dos
 *     llamadas cuando el nombre no existe— y mil renglones no caben en una
 *     petición web.
 *  2. La ingesta de Shopify pagaba ese mismo precio: la corrida de Yellow
 *     Rabbit tardó diez minutos, casi todos esperando nombres.
 *
 * Con el catálogo sembrado, ambas cosas se resuelven contra Postgres y sin red.
 * Se usa `oracle_cards`: una entrada por nombre de carta, no por impresión, que
 * es lo que hace falta para reconocer un nombre.
 */
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { closePool, connectionString } from "../src/lib/db";
import { upsertCards } from "../src/lib/db/queries";

const USER_AGENT = "tcgpool/0.1 (comparador de cartas TCG MX; contacto: hola@tcgpool.mx)";

interface OracleCard {
  name: string;
  oracle_id?: string;
  type_line?: string;
  layout?: string;
  games?: string[];
  image_uris?: { normal?: string };
  card_faces?: Array<{ image_uris?: { normal?: string } }>;
}

/** Fichas y emblemas no son cartas que una tienda venda como single. */
const LAYOUTS_FUERA = new Set([
  "token",
  "double_faced_token",
  "emblem",
  "art_series",
  "vanguard",
  "scheme",
  "planar",
]);

async function main() {
  if (!connectionString()) {
    console.error("Falta DATABASE_URL.");
    process.exit(1);
  }

  const meta = await fetch("https://api.scryfall.com/bulk-data/oracle-cards", {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!meta.ok) throw new Error(`Scryfall bulk-data: HTTP ${meta.status}`);
  const { jsonl_download_uri: uri, updated_at: updatedAt } = (await meta.json()) as {
    jsonl_download_uri: string;
    updated_at: string;
  };
  console.log(`Catálogo de Scryfall del ${updatedAt}\n${uri}`);

  const res = await fetch(uri, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok || !res.body) throw new Error(`descarga: HTTP ${res.status}`);

  // Se lee en streaming y se escribe por lotes: el archivo descomprimido pasa
  // de 200 MB y cargarlo entero en memoria sólo para recorrerlo sería tonto.
  const lineas = createInterface({
    input: Readable.fromWeb(res.body as never).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  let vistas = 0;
  let escritas = 0;
  let lote: Parameters<typeof upsertCards>[0] = [];

  const vaciar = async () => {
    if (!lote.length) return;
    await upsertCards(lote);
    escritas += lote.length;
    lote = [];
    process.stdout.write(`\r  ${escritas} cartas…`);
  };

  for await (const linea of lineas) {
    if (!linea.trim()) continue;
    vistas++;
    const c = JSON.parse(linea) as OracleCard;

    // Sólo lo que una tienda mexicana puede tener en la mano.
    if (!c.games?.includes("paper")) continue;
    if (c.layout && LAYOUTS_FUERA.has(c.layout)) continue;

    lote.push({
      gameId: "magic",
      name: c.name,
      oracleId: c.oracle_id ?? null,
      typeLine: c.type_line ?? null,
      imageUrl: c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal ?? null,
    });
    if (lote.length >= 500) await vaciar();
  }
  await vaciar();

  console.log(`\n✓ ${escritas} cartas sembradas de ${vistas} en el archivo`);
  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
