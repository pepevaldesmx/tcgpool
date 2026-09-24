import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agruparPorFuente, armarComanda, type Pedido } from "@/lib/comanda/armar";
import type { SourceListing } from "@/lib/db/queries";

function fuente(p: Partial<SourceListing> & { listingId: number; cardId: number }): SourceListing {
  return {
    cardName: "Carta",
    cardSlug: "carta",
    printingId: p.listingId * 10,
    setName: "Set",
    setCode: "set",
    collectorNumber: "1",
    imageUrl: null,
    language: "en",
    finish: "nonfoil",
    condition: "NM",
    priceCents: 1000,
    stock: 4,
    storeId: 1,
    storeSlug: "tienda-a",
    storeName: "Tienda A",
    storeCity: "CDMX",
    storeDataSource: "live",
    storeLat: null,
    storeLng: null,
    sellerId: 1,
    sellerName: "Tienda A",
    sellerType: "store",
    origin: "feed",
    ...p,
  };
}

describe("armarComanda", () => {
  it("concentra el pedido en la menor cantidad de tiendas", () => {
    // B tiene las dos cartas; A sólo una y más barata. Gana B: partir la compra
    // para ahorrar unos pesos sale peor en envíos y esperas.
    const pedidos: Pedido[] = [
      { nombre: "Uno", cardId: 1, qty: 1 },
      { nombre: "Dos", cardId: 2, qty: 1 },
    ];
    const sources = [
      fuente({ listingId: 1, cardId: 1, storeSlug: "a", storeId: 1, priceCents: 500 }),
      fuente({ listingId: 2, cardId: 1, storeSlug: "b", storeId: 2, priceCents: 900 }),
      fuente({ listingId: 3, cardId: 2, storeSlug: "b", storeId: 2, priceCents: 900 }),
    ];
    const armado = armarComanda(pedidos, sources);
    assert.equal(armado.tiendas, 1);
    assert.deepEqual(
      armado.picks.map((p) => p.source.listingId).sort(),
      [2, 3],
    );
  });

  it("dentro de una tienda elige su listado más barato", () => {
    const sources = [
      fuente({ listingId: 1, cardId: 1, priceCents: 1500, condition: "NM" }),
      fuente({ listingId: 2, cardId: 1, priceCents: 800, condition: "LP" }),
    ];
    const armado = armarComanda([{ nombre: "Uno", cardId: 1, qty: 1 }], sources);
    assert.equal(armado.picks[0].source.listingId, 2);
  });

  it("reporta lo que nadie tiene, con el nombre que escribió el usuario", () => {
    const armado = armarComanda(
      [
        { nombre: "Sol Ring", cardId: 1, qty: 1 },
        { nombre: "Mox Diamond", cardId: 7, qty: 1 },
        { nombre: "Carta Inventada", cardId: null, qty: 2 },
      ],
      [fuente({ listingId: 1, cardId: 1 })],
    );
    assert.deepEqual(
      armado.sinFuente.map((p) => p.nombre).sort(),
      ["Carta Inventada", "Mox Diamond"],
    );
  });

  it("conserva la cantidad pedida", () => {
    const armado = armarComanda(
      [{ nombre: "Uno", cardId: 1, qty: 3 }],
      [fuente({ listingId: 1, cardId: 1 })],
    );
    assert.equal(armado.picks[0].qty, 3);
  });

  it("la misma carta dos veces en la lista no se pierde", () => {
    // Una lista pegada puede traerla repetida; si la llave del plan fuera el id
    // de la carta, el segundo renglón desaparecería sin decir nada.
    const armado = armarComanda(
      [
        { nombre: "Sol Ring", cardId: 1, qty: 1 },
        { nombre: "sol ring", cardId: 1, qty: 2 },
      ],
      [fuente({ listingId: 1, cardId: 1 })],
    );
    const sumado = agruparPorFuente(armado.picks);
    assert.equal(sumado.length, 1);
    assert.equal(sumado[0].qty, 3);
  });

  it("la cercanía sólo desempata, nunca sacrifica cobertura", () => {
    // La tienda lejana tiene las dos cartas; la de tu ciudad, una.
    const pedidos: Pedido[] = [
      { nombre: "Uno", cardId: 1, qty: 1 },
      { nombre: "Dos", cardId: 2, qty: 1 },
    ];
    const sources = [
      fuente({ listingId: 1, cardId: 1, storeSlug: "cerca", storeId: 1 }),
      fuente({ listingId: 2, cardId: 1, storeSlug: "lejos", storeId: 2 }),
      fuente({ listingId: 3, cardId: 2, storeSlug: "lejos", storeId: 2 }),
    ];
    const armado = armarComanda(
      pedidos,
      sources,
      new Map([
        ["cerca", 0],
        ["lejos", 900],
      ]),
    );
    assert.equal(armado.tiendas, 1);
    assert.equal(armado.picks[0].source.storeSlug, "lejos");
  });
});

describe("agruparPorFuente", () => {
  it("suma cantidades de la misma fuente y deja las demás", () => {
    const a = fuente({ listingId: 1, cardId: 1 });
    const b = fuente({ listingId: 2, cardId: 2 });
    const sumado = agruparPorFuente([
      { source: a, qty: 1 },
      { source: b, qty: 1 },
      { source: a, qty: 2 },
    ]);
    assert.equal(sumado.length, 2);
    assert.equal(sumado.find((p) => p.source.listingId === 1)!.qty, 3);
  });

  it("no muta los picks que recibe", () => {
    const a = fuente({ listingId: 1, cardId: 1 });
    const picks = [
      { source: a, qty: 1 },
      { source: a, qty: 2 },
    ];
    agruparPorFuente(picks);
    assert.equal(picks[0].qty, 1);
  });
});
