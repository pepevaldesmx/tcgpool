/**
 * Genera el catálogo de MUESTRA de MTG Wolf.
 *
 *   npm run make-wolf-demo
 *
 * MTG Wolf corre en Wix y no expone un feed público, así que hasta que suba su
 * inventario real (por CSV, desde su panel) lo que se ve es muestra, marcada
 * como `demo` en cada listado.
 *
 * Por qué se regenera: la muestra anterior salía de una lista curada de ~40
 * cartas, casi todas staples de Commander, todas con stock. Eso hacía que el
 * plan de surtido SIEMPRE recomendara a MTG Wolf —cubría las seis cartas de
 * cualquier lista de prueba— con datos inventados. Una muestra que miente sobre
 * la forma del inventario es peor que no tener muestra.
 *
 * Esta sale de los datos masivos de Scryfall y se parece a la carpeta de una
 * tienda chica: mayoría de cartas baratas de sets recientes, unas cuantas caras,
 * y una parte agotada, como cualquier tienda de verdad.
 */
import fs from "node:fs";
import path from "node:path";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";

const USER_AGENT = "tcgpool/0.1 (comparador de cartas TCG MX; contacto: hola@tcgpool.mx)";
const TOTAL = 800;
const PESOS_POR_DOLAR = 20;

/** Aleatorio con semilla: la muestra tiene que salir igual en cada corrida. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Condición y cuánto castiga el precio. Una tienda chica vende mucho jugado. */
const CONDICIONES: Array<[string, string, number, number]> = [
  ["NM", "Near Mint", 1.0, 5],
  ["LP", "Poco jugada", 0.85, 3],
  ["MP", "Jugada", 0.7, 2],
  ["HP", "Muy jugada", 0.5, 1],
];

function elegirCondicion(r: number): [string, string, number] {
  const total = CONDICIONES.reduce((a, [, , , p]) => a + p, 0);
  let acc = r * total;
  for (const [code, label, factor, peso] of CONDICIONES) {
    acc -= peso;
    if (acc <= 0) return [code, label, factor];
  }
  return ["NM", "Near Mint", 1];
}

interface Carta {
  name: string;
  set_name: string;
  collector_number?: string;
  lang?: string;
  digital?: boolean;
  games?: string[];
  layout?: string;
  image_uris?: { normal?: string };
  prices?: { usd?: string | null };
}

async function main() {
  const meta = await fetch("https://api.scryfall.com/bulk-data/default-cards", {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!meta.ok) throw new Error(`bulk-data: HTTP ${meta.status}`);
  const { jsonl_download_uri: uri } = (await meta.json()) as { jsonl_download_uri: string };

  const res = await fetch(uri, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok || !res.body) throw new Error(`descarga: HTTP ${res.status}`);

  const lineas = createInterface({
    input: Readable.fromWeb(res.body as never).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  // Muestreo por reservorio: el archivo trae ~500,000 impresiones y no cabe en
  // memoria, pero se puede sacar una muestra uniforme de una sola pasada.
  const rand = mulberry32(20260920);
  const muestra: Carta[] = [];
  let elegibles = 0;

  for await (const linea of lineas) {
    if (!linea.trim()) continue;
    const c = JSON.parse(linea) as Carta;
    if (c.digital || !c.games?.includes("paper")) continue;
    if (c.lang !== "en") continue;
    if (!c.image_uris?.normal) continue;
    const usd = Number(c.prices?.usd);
    if (!Number.isFinite(usd) || usd <= 0) continue;
    // Una tienda chica no tiene el Black Lotus: se corta la cola cara.
    if (usd > 60) continue;

    elegibles++;
    if (muestra.length < TOTAL) muestra.push(c);
    else {
      const j = Math.floor(rand() * elegibles);
      if (j < TOTAL) muestra[j] = c;
    }
  }

  const listings = muestra.map((c, i) => {
    const r = rand();
    const [code, label, factor] = elegirCondicion(rand());
    const usd = Number(c.prices?.usd);
    const precio = Math.max(5, Math.round(usd * PESOS_POR_DOLAR * factor * (0.9 + rand() * 0.25)));
    return {
      externalId: `wolf-${5000 + i}`,
      title: `${c.name} [${c.set_name}]`,
      variantTitle: `${label} / Inglés`,
      productType: "Singles",
      tags: ["Magic"],
      priceMxn: precio,
      // Una tienda real tiene agotado lo que ya vendió. Mentir con 100% de
      // disponibilidad es justo lo que hacía ganar siempre a esta tienda.
      available: r > 0.35,
      productUrl: `https://mtgwolf.com/product-page/${c.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`,
      imageUrl: c.image_uris?.normal,
      _condicion: code,
    };
  });

  const salida = {
    _sample: true,
    _nota:
      "MTG Wolf corre en Wix y no expone un feed público. Estos listings son de " +
      "MUESTRA —se marcan como demo en la UI— y salen de una muestra uniforme " +
      "de los datos masivos de Scryfall, para que la forma del inventario se " +
      "parezca a la de una tienda chica y no a una lista de staples.",
    _generated_at: new Date().toISOString(),
    listings: listings.map(({ _condicion, ...l }) => ({
      ...l,
      variantTitle: `${_condicion} / ${l.variantTitle.split(" / ")[1]}`,
    })),
  };

  const file = path.join(process.cwd(), "data", "snapshots", "mtg-wolf.manual.json");
  fs.writeFileSync(file, JSON.stringify(salida, null, 2));
  const conStock = salida.listings.filter((l) => l.available).length;
  console.log(
    `✓ ${file}\n  ${salida.listings.length} listings · ${conStock} con stock · ` +
      `de ${elegibles.toLocaleString("es-MX")} impresiones elegibles`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
