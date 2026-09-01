export type GameId = "magic" | "pokemon" | "yugioh";

export type Condition = "NM" | "LP" | "MP" | "HP" | "DMG" | "SEALED" | "UNKNOWN";

export type Finish = "nonfoil" | "foil" | "etched";

export type SourceType = "shopify" | "manual" | "wix";

export interface StoreConfig {
  slug: string;
  name: string;
  url: string;
  city?: string;
  sourceType: SourceType;
  /** Config específica del adaptador (p.ej. dominio y colecciones de Shopify). */
  sourceConfig: Record<string, unknown>;
  shipsNationwide?: boolean;
  active?: boolean;
}

/**
 * Lo que devuelve un adaptador de ingesta: una fila cruda por variante de
 * producto, todavía sin resolver contra el catálogo canónico de cartas.
 */
export interface RawListing {
  /** id estable dentro de la tienda (variant id de Shopify, SKU, etc.) */
  externalId: string;
  /** Título tal cual viene del feed, antes de normalizar. */
  title: string;
  /** Título de la variante ("Near Mint - English", "NM Foil", ...) si existe. */
  variantTitle?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  priceMxn: number;
  available: boolean;
  stock?: number;
  productUrl: string;
  imageUrl?: string;
}

export interface AdapterResult {
  listings: RawListing[];
  productsSeen: number;
  /** 'live' si se pegó al feed real, 'sample' si se leyó un snapshot local. */
  source: "live" | "sample";
}
