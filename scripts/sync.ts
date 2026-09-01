/**
 * Job de sincronización. Para el MVP se corre a mano o por cron cada varias
 * horas; no hace falta cola de trabajos todavía.
 *
 *   npm run sync                      # ingiere de data/snapshots/ (offline)
 *   npm run sync -- --live            # pega a los feeds reales de las tiendas
 *   npm run sync -- --store=mtg-mexico --live
 *   npm run sync -- --no-enrich       # sin resolver nombres contra Scryfall
 */
import { migrate, openForWrite } from "../src/lib/db/migrate";
import { loadStoreDefinitions } from "../src/lib/ingest/registry";
import { syncStore } from "../src/lib/ingest/run";
import { upsertGame } from "../src/lib/db/queries";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const live = flag("live");
  const only = arg("store");
  const enrich = !flag("no-enrich");
  const offline = flag("offline");

  const db = openForWrite();
  migrate(db);
  upsertGame(db, "magic", "Magic: The Gathering");
  upsertGame(db, "pokemon", "Pokémon TCG");
  upsertGame(db, "yugioh", "Yu-Gi-Oh!");

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
      console.log(
        `  ⚠ dominio sin verificar (${JSON.stringify(def.sourceConfig)}). ` +
          `Confirma la URL en data/stores.json si falla.`,
      );
    }
    const result = await syncStore(db, def, {
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
        `${result.skipped} descartados (sellado/accesorios) · ` +
        `${result.outOfStock} marcados sin stock\n`,
    );
  }

  if (failures) {
    console.error(`${failures} tienda(s) fallaron.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
