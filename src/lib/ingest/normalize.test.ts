import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectCondition,
  detectFinish,
  detectLanguage,
  classifyProduct,
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

describe("classifyProduct", () => {
  it("saca el juego del product_type, que es como lo etiquetan las tiendas", () => {
    const cases: Array<[string, string]> = [
      ["MTG Single", "magic"],
      ["Pokemon Single", "pokemon"],
      ["Yugioh Single", "yugioh"],
      ["One Piece Single", "onepiece"],
      ["Lorcana Single", "lorcana"],
      ["Flesh And Blood Single", "fleshandblood"],
    ];
    for (const [productType, game] of cases) {
      assert.equal(classifyProduct({ ...base, productType }).game, game, productType);
      assert.equal(classifyProduct({ ...base, productType }).kind, "single", productType);
    }
  });

  it("descarta el sellado aunque el título parezca una carta", () => {
    const r = classifyProduct({
      ...base,
      title: "Bloomburrow",
      productType: "MTG Sealed",
    });
    assert.equal(r.kind, "sealed");
    assert.equal(normalizeListing({ ...base, title: "Bloomburrow", productType: "MTG Sealed" }), null);
  });

  it("usa el juego por defecto de la tienda cuando el feed no lo declara", () => {
    const r = normalizeListing({ ...base, productType: "Cartas Sueltas" }, "magic");
    assert.equal(r?.game, "magic");
    // El respaldo resuelve el juego, pero si ese juego está apagado se descarta
    // igual: el respaldo decide CUÁL juego es, no si lo aceptamos.
    assert.equal(normalizeListing({ ...base, productType: "Cartas Sueltas" }, "pokemon"), null);
  });

  it("el número de colección y el acabado NO son parte del nombre", () => {
    // Estos seis títulos son de MTG México, y antes producían SEIS cartas
    // distintas llamadas "Command Tower": el buscador partía la carta en
    // pedazos y el cruce entre tiendas dejaba de funcionar.
    const casos: Array<[string, string, string | undefined, string | undefined]> = [
      ["Command Tower [Marvel Super Heroes Commander]", "Command Tower", "Marvel Super Heroes Commander", undefined],
      ["Command Tower (0917) [Secret Lair Drop Series]", "Command Tower", "Secret Lair Drop Series", "0917"],
      ["Command Tower (Surge Foil) [Teenage Mutant Ninja Turtles Commander]", "Command Tower", "Teenage Mutant Ninja Turtles Commander", undefined],
      ["Command Tower (0233) (Surge Foil) [Marvel Super Heroes Commander]", "Command Tower", "Marvel Super Heroes Commander", "0233"],
      ["Command Tower (DSC) [The List]", "Command Tower", "The List", undefined],
    ];
    for (const [titulo, nombre, set, numero] of casos) {
      const r = parseTitle(titulo);
      assert.equal(r.cardName, nombre, titulo);
      assert.equal(r.setName, set, titulo);
      assert.equal(r.collectorNumber, numero, titulo);
    }
  });

  it("el idioma después del corchete no es parte del nombre", () => {
    // Títulos reales de MTG México. Antes, el corchete tenía que estar al final
    // y esto dejaba el título entero como nombre: 552 cartas fantasma, muchas
    // en español, que es justo lo que un mercado mexicano no puede perder.
    const casos: Array<[string, string, string | undefined]> = [
      ["Brainstorm [Mercadian Masques] JAPONES", "Brainstorm", "Mercadian Masques"],
      ["Angelic Wall [Odyssey] ESPAÑOL", "Angelic Wall", "Odyssey"],
      ["Archmage of Runes [Foundations]ESPAÑOL", "Archmage of Runes", "Foundations"],
      // "(Pro Tour)" se queda: no está en la lista de tratamientos, y es el
      // catálogo —no una lista de palabras— quien lo resuelve después.
      ["Avatar of Woe (Pro Tour) [Pro Tour Promos] Signed", "Avatar of Woe (Pro Tour)", "Pro Tour Promos"],
    ];
    for (const [titulo, nombre, set] of casos) {
      const r = parseTitle(titulo);
      assert.equal(r.cardName, nombre, titulo);
      assert.equal(r.setName, set, titulo);
    }
  });

  it("un paréntesis con número NO es el nombre del set", () => {
    // Antes "Command Tower (0917)" guardaba "0917" como nombre del set.
    const r = parseTitle("Command Tower (0917)");
    assert.equal(r.cardName, "Command Tower");
    assert.equal(r.setName, undefined);
    assert.equal(r.collectorNumber, "0917");
  });

  it("un paréntesis que sí es un set se respeta", () => {
    const r = parseTitle("Lightning Bolt (Ravnica: Clue Edition)");
    assert.equal(r.cardName, "Lightning Bolt");
    assert.equal(r.setName, "Ravnica: Clue Edition");
    assert.equal(r.collectorNumber, undefined);
  });

  it("un juego que no soportamos NO cae al juego por defecto de la tienda", () => {
    // Una tienda de Magic que además vende Star Wars Unlimited: meter esas
    // cartas al catálogo de Magic es peor que no tenerlas.
    assert.equal(
      normalizeListing(
        { ...base, title: "Darth Vader (SOR-010)", productType: "Star Wars Single" },
        "magic",
      ),
      null,
    );
    // Pero "Cartas Sueltas" no nombra ningún juego: ahí el respaldo sí aplica.
    assert.equal(
      normalizeListing({ ...base, productType: "Cartas Sueltas" }, "magic")?.game,
      "magic",
    );
  });

  it("detecta Digimon y lo descarta, en vez de colarlo como Magic", () => {
    const raw = { ...base, title: "Agumon [BT1-010]", productType: "Digimon Single" };
    // Se detecta: por eso NO cae al defaultGame de la tienda...
    assert.equal(classifyProduct(raw).game, "digimon");
    // ...y como hoy sólo aceptamos Magic, no entra al catálogo.
    assert.equal(normalizeListing(raw, "magic"), null);
  });

  it("un Yu-Gi-Oh de una tienda mayormente de Magic NO entra como Magic", () => {
    const raw = {
      ...base,
      title: "YummySnatchy [26LP-EN005] Ultra Rare",
      productType: "Yugioh Single",
    };
    assert.equal(classifyProduct(raw).game, "yugioh");
    assert.equal(normalizeListing(raw, "magic"), null);
  });

  it("un single de Magic sí entra", () => {
    const r = normalizeListing({ ...base, productType: "MTG Single" }, "magic");
    assert.equal(r?.game, "magic");
  });
});
