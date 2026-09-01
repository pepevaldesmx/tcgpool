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
  const db = getDb({ create: true });
  // `delete`, no WAL: el archivo que se publica tiene que poder abrirse desde
  // un filesystem de sólo lectura, y una base en WAL necesita crear -wal/-shm.
  db.pragma("journal_mode = DELETE");
  return db;
}

/** Journal mode con el que quedó el archivo (para verificarlo tras construir). */
export function journalMode(db: Database): string {
  const rows = db.pragma("journal_mode") as Array<{ journal_mode: string }>;
  return rows[0]?.journal_mode ?? "unknown";
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
