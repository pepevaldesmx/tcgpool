/**
 * Aplica el esquema a la base de Postgres apuntada por DATABASE_URL.
 *
 *   DATABASE_URL=postgres://... npm run db:migrate
 *
 * Idempotente: correrlo de más no hace daño.
 */
import { closePool, connectionString } from "../src/lib/db";
import { migrate } from "../src/lib/db/migrate";
import { upsertGame } from "../src/lib/db/queries";
import { GAMES } from "../src/lib/games";

async function main() {
  if (!connectionString()) {
    console.error(
      "Falta DATABASE_URL (o POSTGRES_URL). Crea la base en Vercel Postgres o " +
        "Neon y expórtala antes de correr esto.",
    );
    process.exit(1);
  }
  await migrate();
  for (const game of GAMES) await upsertGame(game.id, game.name);
  console.log(`✓ esquema aplicado · ${GAMES.length} juegos registrados`);
  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
