import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveAgainstCatalog } from "@/lib/ingest/resolve";
import { normalizeText } from "@/lib/ingest/normalize";

const catalogo = (...nombres: string[]) => {
  const set = new Set(nombres.map(normalizeText));
  return (k: string) => set.has(k);
};

describe("resolveAgainstCatalog", () => {
  it("recorta paréntesis hasta dar con una carta real", () => {
    const conoce = catalogo("Avatar of Woe");
    assert.equal(resolveAgainstCatalog("Avatar of Woe (Pro Tour)", conoce), "Avatar of Woe");
  });

  it("prefiere el nombre más largo que el catálogo conoce", () => {
    // "Erase (Not the Urza's Legacy One)" es una carta de verdad. Recortarla
    // hasta "Erase" —que TAMBIÉN existe— sería cambiarla por otra carta.
    const conoce = catalogo("Erase", "Erase (Not the Urza's Legacy One)");
    assert.equal(
      resolveAgainstCatalog("Erase (Not the Urza's Legacy One)", conoce),
      "Erase (Not the Urza's Legacy One)",
    );
  });

  it("si nada empata, no inventa", () => {
    assert.equal(resolveAgainstCatalog("Food Token", catalogo("Sol Ring")), null);
  });

  it("no recorta hasta dejarlo vacío", () => {
    assert.equal(resolveAgainstCatalog("(Promo)", catalogo("Sol Ring")), null);
  });
});
