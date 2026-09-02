/**
 * Crea la tabla de señales de demanda en Postgres.
 *
 *   DATABASE_URL=postgres://... npm run events:migrate
 *
 * En Vercel la variable la pone la integración de Postgres/Neon; corre esto una
 * vez contra esa misma base.
 */
import { isEventsStoreEnabled, migrateEventsStore } from "../src/lib/events/store";

async function main() {
  if (!isEventsStoreEnabled()) {
    console.error(
      "No hay DATABASE_URL (ni POSTGRES_URL). Crea la base en Neon o Vercel " +
        "Postgres y expórtala antes de correr esto.",
    );
    process.exit(1);
  }
  await migrateEventsStore();
  console.log("✓ tabla card_events lista");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
