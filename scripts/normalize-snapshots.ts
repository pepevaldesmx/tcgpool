/**
 * Reescribe los snapshots ya guardados en la forma normalizada.
 *
 * Se corre una vez después de cambiar el formato: sin esto, el siguiente sync
 * generaría un diff gigante sólo por el cambio de forma.
 *
 *   npm run snapshots:normalize
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeFeed, type ShopifyFeed } from "../src/lib/ingest/adapters/shopify";

const dir = path.join(process.cwd(), "data", "snapshots");

for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith(".json") || name.includes(".manual.")) continue;
  const file = path.join(dir, name);
  const before = fs.statSync(file).size;
  const feed = JSON.parse(fs.readFileSync(file, "utf8")) as ShopifyFeed;
  if (!feed.products) continue;
  fs.writeFileSync(file, JSON.stringify(normalizeFeed(feed), null, 2));
  const after = fs.statSync(file).size;
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  console.log(`${name}: ${mb(before)} MB → ${mb(after)} MB`);
}
