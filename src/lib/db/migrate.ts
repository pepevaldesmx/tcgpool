import fs from "node:fs";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { DB_PATH, getDb } from "@/lib/db";

/**
 * Sólo lo usan los scripts de ingesta (`scripts/*.ts`), nunca la app: mantener
 * el acceso a disco fuera de `src/lib/db/index.ts` evita que Next empaquete el
 * repositorio completo en las funciones serverless.
 */
export function openForWrite(): Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  return getDb({ create: true });
}

/** Crea el esquema si no existe. Idempotente. */
export function migrate(db: Database) {
  const schema = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "db", "schema.sql"),
    "utf8",
  );
  db.exec(schema);
}

/** Borra los archivos de la base (incluidos los del WAL). */
export function dropDatabase() {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${DB_PATH}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file);
  }
}
