import Database from "better-sqlite3";
import path from "node:path";

/**
 * Ruta de la base. Estática a propósito: Next traza los accesos a disco para
 * decidir qué empaquetar en las funciones serverless, y una ruta dinámica lo
 * obliga a incluir el repo entero.
 */
export const DB_PATH = path.join(process.cwd(), "data", "tcgpool.db");

let cached: Database.Database | null = null;

export interface DbOptions {
  /** Sólo los scripts de ingesta crean la base; la app siempre lee una existente. */
  create?: boolean;
}

/**
 * Conexión SQLite compartida. La app habla con la BD únicamente a través de
 * `src/lib/db/queries.ts`, así que migrar a Postgres más adelante es reescribir
 * ese archivo, no la aplicación.
 */
export function getDb(options: DbOptions = {}): Database.Database {
  if (cached) return cached;

  let db: Database.Database;
  try {
    db = new Database(DB_PATH, { fileMustExist: !options.create });
  } catch (err) {
    throw new Error(
      `No se pudo abrir ${DB_PATH}. ¿Corriste \`npm run db:build\`? (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  cached = db;
  return db;
}
