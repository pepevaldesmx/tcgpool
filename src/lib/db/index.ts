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
  /** Sólo los scripts de ingesta escriben; la app siempre abre en modo lectura. */
  create?: boolean;
}

/**
 * Conexión SQLite compartida. La app habla con la BD únicamente a través de
 * `src/lib/db/queries.ts`, así que migrar a Postgres más adelante es reescribir
 * ese archivo, no la aplicación.
 *
 * En runtime la base es de SÓLO LECTURA y así hay que abrirla: en Vercel el
 * filesystem de la función es inmutable, y cualquier intento de escritura
 * —incluido fijar el journal mode— revienta con "attempt to write a readonly
 * database" en cada request. Por lo mismo el archivo se publica sin WAL (ver
 * `openForWrite` en migrate.ts): abrir una base en WAL exige crear los archivos
 * `-wal` y `-shm` junto a ella.
 */
export function getDb(options: DbOptions = {}): Database.Database {
  if (cached) return cached;

  const readonly = !options.create;
  let db: Database.Database;
  try {
    db = new Database(DB_PATH, { readonly, fileMustExist: readonly });
  } catch (err) {
    throw new Error(
      `No se pudo abrir ${DB_PATH}. ¿Corriste \`npm run db:build\`? (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }

  db.pragma("foreign_keys = ON");
  cached = db;
  return db;
}
