/**
 * Reconstruye data/tcgpool.db desde cero a partir de los snapshots versionados.
 * Corre en `npm run build`, así que tiene que ser determinista y no depender de
 * la red (usa la caché de Scryfall en data/scryfall-cache.json).
 */
import { DB_PATH } from "../src/lib/db";
import { dropDatabase, migrate, openForWrite } from "../src/lib/db/migrate";
import { loadStoreDefinitions } from "../src/lib/ingest/registry";
import { syncStore } from "../src/lib/ingest/run";
import { getStats, upsertGame } from "../src/lib/db/queries";

async function main() {
  dropDatabase();

  const db = openForWrite();
  migrate(db);
  upsertGame(db, "magic", "Magic: The Gathering");
  upsertGame(db, "pokemon", "Pokémon TCG");
  upsertGame(db, "yugioh", "Yu-Gi-Oh!");

  for (const def of loadStoreDefinitions()) {
    const result = await syncStore(db, def, {
      mode: "snapshot",
      enrich: true,
      // En build no dependemos de la red: sólo caché.
      offline: process.env.TCGPOOL_ONLINE_BUILD !== "1",
    });
    console.log(
      `  ${def.slug}: ${result.upserted} listings` +
        (result.error ? ` (error: ${result.error})` : ""),
    );
  }

  const stats = getStats();
  console.log(
    `\n✓ ${DB_PATH}\n  ${stats.stores} tiendas · ${stats.cards} cartas · ` +
      `${stats.listings} listings (${stats.inStock} con stock)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
