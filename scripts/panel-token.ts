/**
 * Genera (o rota) la llave del panel de una tienda e imprime su link.
 *
 *   npm run panel:token -- --store=mtg-mexico
 *   npm run panel:token -- --store=mtg-mexico --rotar
 *
 * Sin cuentas todavía: quien tiene el link entra. Rotar la llave revoca el link
 * anterior, que es lo que hay que hacer si se filtró.
 */
import { randomBytes } from "node:crypto";
import { closePool, connectionString, one } from "../src/lib/db";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  if (!connectionString()) {
    console.error("Falta DATABASE_URL.");
    process.exit(1);
  }
  const slug = arg("store");
  if (!slug) {
    console.error("Uso: npm run panel:token -- --store=<slug> [--rotar]");
    process.exit(1);
  }

  const store = await one<{ id: number; name: string; panelToken: string | null }>(
    `SELECT id, name, panel_token AS "panelToken" FROM stores WHERE slug = $1`,
    [slug],
  );
  if (!store) {
    console.error(`No hay tienda con slug '${slug}'.`);
    process.exit(1);
  }

  let token = store.panelToken;
  if (!token || process.argv.includes("--rotar")) {
    token = randomBytes(24).toString("base64url");
    await one(`UPDATE stores SET panel_token = $2 WHERE id = $1 RETURNING id`, [store.id, token]);
    console.log(store.panelToken ? "Llave rotada: el link anterior dejó de servir." : "Llave creada.");
  }

  const base = process.env.PANEL_BASE_URL ?? "https://<tu-dominio>";
  console.log(`\n${store.name}\n${base}/tienda/${slug}?t=${token}\n`);
  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
