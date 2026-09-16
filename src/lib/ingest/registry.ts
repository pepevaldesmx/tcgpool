import fs from "node:fs";
import path from "node:path";
import type { GameId, SourceType } from "@/lib/types";

export interface StoreDefinition {
  slug: string;
  name: string;
  url: string;
  city?: string;
  /** Centro de la ciudad, para ordenar por cercanía. No es la dirección. */
  lat?: number;
  lng?: number;
  sourceType: SourceType;
  sourceConfig: Record<string, unknown>;
  /** Juego a asumir cuando el feed no lo declara. Default: magic. */
  defaultGame?: GameId;
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
