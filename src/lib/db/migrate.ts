import fs from "node:fs";
import path from "node:path";
import { getPool } from "@/lib/db";

/**
 * Aplica el esquema. Es idempotente (todo es CREATE ... IF NOT EXISTS), así que
 * correrlo de más no hace daño.
 *
 * Vive aparte de `index.ts` porque lee del disco y sólo lo usan los scripts.
 */
export async function migrate(): Promise<void> {
  const schema = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "db", "schema.sql"),
    "utf8",
  );
  await getPool().query(schema);
}
