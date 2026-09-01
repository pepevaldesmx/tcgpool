/**
 * Captura el feed real de una tienda a data/snapshots/<slug>.live.json sin
 * tocar la base. Útil para revisar qué manda una tienda antes de ingerirla.
 *
 *   npm run snapshot -- --store=mtg-mexico
 */
import { loadStoreDefinitions } from "../src/lib/ingest/registry";
import {
  fetchShopifyFeed,
  writeSnapshot,
  type ShopifyConfig,
} from "../src/lib/ingest/adapters/shopify";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

async function main() {
  const only = arg("store");
  const defs = loadStoreDefinitions().filter(
    (d) => d.sourceType === "shopify" && (!only || d.slug === only),
  );
  if (!defs.length) {
    console.error("Nada que capturar (¿slug incorrecto o tienda no-Shopify?).");
    process.exit(1);
  }

  for (const def of defs) {
    console.log(`▸ ${def.name}`);
    try {
      const feed = await fetchShopifyFeed(def.sourceConfig as unknown as ShopifyConfig, {
        onPage: (page, count) => console.log(`  página ${page}: ${count} productos`),
      });
      const file = writeSnapshot(def.slug, "live", feed);
      console.log(`  ✓ ${feed.products.length} productos → ${file}\n`);
    } catch (err) {
      console.log(`  ✗ ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
