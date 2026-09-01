import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectCondition,
  detectFinish,
  detectLanguage,
  looksLikeSingle,
  normalizeListing,
  parseTitle,
} from "./normalize";
import type { RawListing } from "@/lib/types";

const base: RawListing = {
  externalId: "1",
  title: "Sol Ring [Commander 2021]",
  priceMxn: 120,
  available: true,
  productUrl: "https://ejemplo.mx/products/sol-ring",
};

describe("parseTitle", () => {
  it("saca el set de los tres formatos que usan las tiendas MX", () => {
    assert.deepEqual(parseTitle("Sol Ring [Commander 2021]"), {
      cardName: "Sol Ring",
      setName: "Commander 2021",
    });
    assert.deepEqual(parseTitle("Sol Ring (Double Masters 2022)"), {
      cardName: "Sol Ring",
      setName: "Double Masters 2022",
    });
    assert.deepEqual(parseTitle("Sol Ring - Ravnica: Clue Edition"), {
      cardName: "Sol Ring",
      setName: "Ravnica: Clue Edition",
    });
  });

  it("no confunde '(Foil)' con un set", () => {
    assert.equal(parseTitle("Sol Ring (Foil)").setName, undefined);
    assert.equal(parseTitle("Sol Ring (Foil)").cardName, "Sol Ring");
  });

  it("quita el sufijo de acabado sin comerse el nombre", () => {
    assert.equal(parseTitle("Lightning Bolt (Foil) [Beta]").cardName, "Lightning Bolt");
  });
});

describe("detectCondition", () => {
  it("entiende abreviaturas, nombres largos y español", () => {
    assert.equal(detectCondition("Near Mint"), "NM");
    assert.equal(detectCondition("NM-Mint, English"), "NM");
    assert.equal(detectCondition("Lightly Played Foil"), "LP");
    assert.equal(detectCondition("Muy jugada"), "HP");
    assert.equal(detectCondition("Dañada"), "DMG");
    assert.equal(detectCondition(""), "UNKNOWN");
  });
});

describe("detectFinish", () => {
  it("distingue foil de non-foil", () => {
    assert.equal(detectFinish("NM Foil"), "foil");
    assert.equal(detectFinish("Near Mint Non-Foil"), "nonfoil");
    assert.equal(detectFinish("Etched Foil"), "etched");
    assert.equal(detectFinish("Near Mint"), "nonfoil");
  });
});

describe("detectLanguage", () => {
  it("no toma el 'en' de 'carta en español' como inglés", () => {
    assert.equal(detectLanguage("Carta en español"), "es");
    assert.equal(detectLanguage("NM - English"), "en");
    assert.equal(detectLanguage("NM / Japonés"), "ja");
    assert.equal(detectLanguage("Near Mint"), "en");
  });
});

describe("looksLikeSingle", () => {
  it("descarta sellado y accesorios", () => {
    const noise = ["Foundations Play Booster Box", "Micas Dragon Shield (100)", "Playmat MTG"];
    for (const title of noise) {
      assert.equal(looksLikeSingle({ ...base, title }), false, title);
    }
  });

  it("acepta cartas sueltas", () => {
    assert.equal(looksLikeSingle(base), true);
  });
});

describe("normalizeListing", () => {
  it("arma el listing completo desde título + variante", () => {
    const result = normalizeListing({
      ...base,
      title: "Lightning Bolt (Foil) [Modern Horizons 2]",
      variantTitle: "Lightly Played - Español",
      priceMxn: 249.5,
    });
    assert.ok(result);
    assert.equal(result.cardName, "Lightning Bolt");
    assert.equal(result.setName, "Modern Horizons 2");
    assert.equal(result.condition, "LP");
    assert.equal(result.finish, "foil");
    assert.equal(result.language, "es");
    assert.equal(result.priceCents, 24950);
    assert.equal(result.inStock, true);
  });

  it("descarta precios inválidos", () => {
    assert.equal(normalizeListing({ ...base, priceMxn: 0 }), null);
  });

  it("marca sin stock lo no disponible", () => {
    const result = normalizeListing({ ...base, available: false });
    assert.equal(result?.inStock, false);
  });
});

describe("looksLikeSingle: ruido por palabra completa", () => {
  it("no confunde una carta con un término de ruido que la contiene", () => {
    // "counter" está en la lista de ruido por los dice counters; Counterspell
    // es una de las cartas más comunes de Magic y se estaba descartando.
    const cards = [
      "Counterspell [Commander Masters]",
      "Boxing Ring [Assassin's Creed]",
      "Dockside Extortionist [Commander Legends]",
    ];
    for (const title of cards) {
      assert.equal(looksLikeSingle({ ...base, title }), true, title);
    }
  });

  it("sigue descartando el sellado y los accesorios", () => {
    const noise = [
      "Dados de vida Ultra Pro",
      "Counters de +1/+1",
      "Deck Box Ultra Pro",
      "Foundations Booster Box",
    ];
    for (const title of noise) {
      assert.equal(looksLikeSingle({ ...base, title }), false, title);
    }
  });
});
