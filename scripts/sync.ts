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
import {
  getStats,
  pruneGamesNotIn,
  pruneOrphans,
  pruneStoresNotIn,
  upsertGame,
} from "../src/lib/db/queries";
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
      `  ${result.partial ? "◐" : "✓"} ${result.upserted} listings (${result.source})` +
        `${result.partial ? " · PARCIAL, sin barrer agotados" : ` · ${result.outOfStock} marcados sin stock`}` +
        ` · ${result.skipped} descartados · ${((Date.now() - started) / 1000).toFixed(1)}s\n`,
    );
  }

  // Los juegos apagados salen siempre: la lista es una constante del código, no
  // depende de qué tiendas se hayan pedido en esta corrida.
  const games = await pruneGamesNotIn(GAMES.map((g) => g.id));
  if (games.cards) {
    console.log(
      `✂ juegos fuera del catálogo: ${games.games.join(", ") || "(ninguno)"} · ` +
        `${games.cards} cartas borradas\n`,
    );
  }

  // Sólo con el registro completo a la vista: con --store no sabemos si las
  // demás tiendas se quitaron o simplemente no se pidieron.
  if (!only) {
    const pruned = await pruneStoresNotIn(defs.map((d) => d.slug));
    if (pruned.stores.length) {
      console.log(
        `✂ fuera del registro: ${pruned.stores.join(", ")} · ` +
          `${pruned.printings} impresiones y ${pruned.cards} cartas se quedaron sin listados\n`,
      );
    }
  }

  // Lo que se quedó sin listados sale del catálogo: cartas de tiendas que ya
  // no están, e impresiones que existían sólo por un título mal parseado.
  if (!only) {
    const huerfanos = await pruneOrphans();
    if (huerfanos.cards || huerfanos.printings) {
      console.log(
        `✂ sin listados: ${huerfanos.cards} cartas y ${huerfanos.printings} impresiones\n`,
      );
    }
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
