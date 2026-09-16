import { Pool, type QueryResultRow } from "pg";

/**
 * Conexión a Postgres. Una sola base para todo: catálogo y señales de demanda.
 *
 * El catálogo dejó de ser un SQLite de sólo lectura reconstruido en cada build
 * porque las tiendas administran su inventario, se sincronizan solas y manejan
 * a sus afiliados: todo eso son escrituras en runtime, y el filesystem de la
 * función serverless es inmutable.
 */

export function connectionString(): string | null {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    null
  );
}

export function isConfigured(): boolean {
  return connectionString() !== null;
}

let pool: Pool | null = null;

export function getPool(): Pool {
  const url = connectionString();
  if (!url) {
    throw new Error(
      "Falta DATABASE_URL (o POSTGRES_URL). El catálogo vive en Postgres: " +
        "crea la base y corre `npm run db:migrate`.",
    );
  }
  pool ??= new Pool({
    connectionString: url,
    // Una función serverless atiende una request a la vez; más conexiones sólo
    // gastarían el cupo del proveedor. Los scripts de ingesta suben este número.
    max: Number.parseInt(process.env.PGPOOL_MAX ?? "1", 10),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Los Postgres administrados exigen TLS con certificados que el runtime no
    // siempre trae en su almacén.
    ssl:
      url.includes("localhost") || url.includes("127.0.0.1")
        ? undefined
        : { rejectUnauthorized: false },
  });
  return pool;
}

export async function query<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { rows } = await getPool().query<T>(sql, params);
  return rows;
}

export async function one<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Ejecuta `fn` dentro de una transacción. */
export async function transaction<T>(
  fn: (run: (sql: string, params?: unknown[]) => Promise<unknown[]>) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(async (sql, params = []) => {
      const { rows } = await client.query(sql, params);
      return rows;
    });
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = null;
}
