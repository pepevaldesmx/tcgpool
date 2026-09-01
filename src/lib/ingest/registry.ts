import fs from "node:fs";
import path from "node:path";
import type { SourceType } from "@/lib/types";

export interface StoreDefinition {
  slug: string;
  name: string;
  url: string;
  city?: string;
  sourceType: SourceType;
  sourceConfig: Record<string, unknown>;
  domainVerified?: boolean;
  active?: boolean;
}

/**
 * Registro de tiendas. Agregar una tienda Shopify nueva = una entrada más en
 * data/stores.json; no hay que tocar código.
 */
export function loadStoreDefinitions(): StoreDefinition[] {
  const file = path.join(process.cwd(), "data", "stores.json");
  const body = JSON.parse(fs.readFileSync(file, "utf8")) as { stores: StoreDefinition[] };
  return body.stores;
}
