/**
 * Job de sincronización: ingiere los catálogos de las tiendas a Postgres.
 *
 *   npm run sync                      # desde data/snapshots/ (offline)
 *   npm run sync -- --live            # pega a los feeds reales
 *   npm run sync -- --store=mtg-mexico --live
 *   npm run sync -- --no-enrich       # sin resolver nombres contra Scryfall
 */
import { closePool, connectionString } from "../src/lib/db";
import { migrate } from "../src/lib/db/migrate";
import { upsertGame, getStats } from "../src/lib/db/queries";
import { GAMES } from "../src/lib/games";
import { loadStoreDefinitions } from "../src/lib/ingest/registry";
import { syncStore } from "../src/lib/ingest/run";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  if (!connectionString()) {
    console.error("Falta DATABASE_URL (o POSTGRES_URL).");
    process.exit(1);
  }

  const live = flag("live");
  const only = arg("store");
  const enrich = !flag("no-enrich");
  const offline = flag("offline");

  await migrate();
  for (const game of GAMES) await upsertGame(game.id, game.name);

  const defs = loadStoreDefinitions().filter((d) => !only || d.slug === only);
  if (!defs.length) {
    console.error(`No hay tienda con slug '${only}' en data/stores.json`);
    process.exit(1);
  }

  console.log(
    `Sincronizando ${defs.length} tienda(s) en modo ${live ? "LIVE" : "SNAPSHOT"}` +
      `${enrich ? " con enriquecimiento Scryfall" : ""}\n`,
  );

  let failures = 0;
  for (const def of defs) {
    console.log(`▸ ${def.name} (${def.sourceType})`);
    if (live && def.domainVerified === false) {
      console.log(`  ⚠ dominio sin verificar. Confirma la URL en data/stores.json si falla.`);
    }
    const started = Date.now();
    const result = await syncStore(def, {
      mode: live ? "live" : "snapshot",
      enrich,
      offline,
      log: (m) => console.log(m),
    });
    if (result.error) {
      failures++;
      console.log(`  ✗ ${result.error}\n`);
      continue;
    }
    console.log(
      `  ✓ ${result.upserted} listings (${result.source}) · ` +
        `${result.skipped} descartados · ${result.outOfStock} marcados sin stock · ` +
        `${((Date.now() - started) / 1000).toFixed(1)}s\n`,
    );
  }

  const stats = await getStats();
  console.log(
    `${stats.stores} tiendas · ${stats.cards} cartas · ${stats.listings} listings ` +
      `(${stats.inStock} con stock)`,
  );

  await closePool();
  if (failures) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
