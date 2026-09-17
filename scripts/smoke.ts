/**
 * Reporte de humo: corre las consultas que la app usa de verdad contra la base
 * apuntada por DATABASE_URL, e imprime lo que devuelven.
 *
 *   npm run smoke
 *
 * Es de SÓLO LECTURA. Existe porque quien revisa el catálogo no siempre puede
 * abrir el sitio —una red con egress restringido, por ejemplo— y "el deploy
 * salió verde" no dice si la búsqueda encuentra cartas ni si alguna está
 * repartida entre tiendas, que es el único criterio que le importa a la demo.
 *
 * No imprime la cadena de conexión ni nada que venga de ella salvo el catálogo.
 */
import { closePool, connectionString } from "../src/lib/db";
import {
  findCardByName,
  getCheapestByCardAndStore,
  getListingsForCard,
  getProvenance,
  getStats,
  getTopCardsBySupply,
  listGames,
  listStoresPublic,
  searchCards,
} from "../src/lib/db/queries";
import { planFulfillment, type FulfillmentLine } from "../src/lib/fulfillment";

const money = (cents: number | null) =>
  cents == null ? "—" : `$${(cents / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

function title(t: string) {
  console.log(`\n${t}\n${"─".repeat(t.length)}`);
}

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t0 = Date.now();
  return [await fn(), Date.now() - t0];
}

/** La lista de prueba: cartas comunes de Commander, repartidas entre tiendas. */
const LISTA = [
  "Sol Ring",
  "Counterspell",
  "Lightning Bolt",
  "Cultivate",
  "Swords to Plowshares",
  "Arcane Signet",
];

async function main() {
  if (!connectionString()) {
    console.error("Falta DATABASE_URL.");
    process.exit(1);
  }

  title("Catálogo");
  const stats = await getStats();
  console.log(
    `${stats.stores} tiendas · ${stats.cards} cartas · ${stats.listings} listings ` +
      `(${stats.inStock} con stock) · último sync ${stats.lastSyncedAt ?? "nunca"}`,
  );

  const prov = await getProvenance();
  console.log(
    `procedencia: ${prov.live} tienda(s) con feed real` +
      (prov.sample ? ` · ${prov.sample} en muestra: ${prov.sampleNames.join(", ")}` : ""),
  );

  title("Tiendas");
  for (const s of await listStoresPublic()) {
    console.log(
      `  ${s.name.padEnd(16)} ${String(s.inStockCount).padStart(6)} con stock ` +
        `de ${String(s.listingCount).padStart(6)} · ${String(s.cardCount).padStart(5)} cartas ` +
        `· ${s.city ?? "?"} · ${s.dataSource}`,
    );
  }

  title("Juegos");
  for (const g of await listGames()) {
    console.log(`  ${g.name.padEnd(16)} ${String(g.cardCount).padStart(6)} cartas · ${g.inStockCount} con stock`);
  }

  title("Búsqueda");
  for (const q of ["sol ring", "counterspell", "counterspel", "charizard", "bolt"]) {
    const [rows, ms] = await timed(() => searchCards(q, { limit: 3 }));
    console.log(`  "${q}" → ${rows.length} en ${ms}ms`);
    for (const c of rows) {
      console.log(
        `      ${c.name} · ${c.gameId} · ${c.storeCount} tienda(s) · ` +
          `${c.inStockCount} con stock · desde ${money(c.minPriceCents)}`,
      );
    }
  }

  title("Cartas repartidas entre tiendas (el argumento de la demo)");
  const top = await getTopCardsBySupply(8);
  if (!top.length) console.log("  ninguna");
  for (const c of top) {
    console.log(
      `  ${c.name.padEnd(28)} ${c.storeCount} tienda(s) · ${c.inStockCount} con stock · ` +
        `${money(c.minPriceCents)} – ${money(c.maxPriceCents)}`,
    );
  }

  const repartida = top.find((c) => c.storeCount > 1) ?? top[0];
  if (repartida) {
    title(`Vista de carta: ${repartida.name}`);
    const listings = await getListingsForCard(repartida.id, { onlyInStock: true });
    for (const l of listings.slice(0, 10)) {
      console.log(
        `  ${l.storeName.padEnd(16)} ${money(l.priceCents).padStart(11)} · ${l.condition} · ` +
          `${l.language} · ${l.finish} · ${l.setName ?? "?"} · ${l.storeDataSource}`,
      );
    }
    if (listings.length > 10) console.log(`  … y ${listings.length - 10} más`);
  }

  title(`Plan de surtido para ${LISTA.length} cartas`);
  const lines: FulfillmentLine[] = [];
  const faltantes: string[] = [];
  for (const name of LISTA) {
    const card = await findCardByName(name);
    if (!card) {
      faltantes.push(name);
      continue;
    }
    const prices = await getCheapestByCardAndStore([card.id]);
    lines.push({
      key: card.name,
      qty: 1,
      priceByStore: new Map(prices.map((p) => [p.storeSlug, p.priceCents])),
    });
  }
  const plan = planFulfillment(lines);
  for (const leg of plan.legs) {
    console.log(
      `  ${leg.storeSlug.padEnd(16)} cubre ${leg.cardKeys.length} · ${money(leg.subtotalCents)}`,
    );
    console.log(`      ${leg.cardKeys.join(", ")}`);
  }
  console.log(
    `  → ${plan.covered}/${LISTA.length} cartas en ${plan.legs.length} pedido(s) · ${money(plan.totalCents)}`,
  );
  const sinCubrir = [...plan.uncovered, ...faltantes];
  if (sinCubrir.length) console.log(`  sin cubrir: ${sinCubrir.join(", ")}`);

  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
