import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { huellaRevision, revalidar, type RenglonParaRevisar } from "@/lib/comanda/revalidar";
import type { ListingStatus, SourceListing } from "@/lib/db/queries";

function renglon(p: Partial<RenglonParaRevisar> = {}): RenglonParaRevisar {
  return {
    id: 1,
    cardId: 10,
    cardName: "Sol Ring",
    listingId: 100,
    storeSlug: "a",
    unitPriceCents: 4000,
    qty: 2,
    ...p,
  };
}

function estado(p: Partial<ListingStatus> & { listingId: number }): Map<number, ListingStatus> {
  return new Map([
    [p.listingId, { priceCents: 4000, stock: 5, inStock: true, ...p }],
  ]);
}

function fuente(p: Partial<SourceListing> & { listingId: number; cardId: number }): SourceListing {
  return {
    cardName: "Sol Ring",
    cardSlug: "sol-ring",
    printingId: 1,
    setName: "S",
    setCode: "s",
    collectorNumber: "1",
    imageUrl: null,
    language: "en",
    finish: "nonfoil",
    condition: "NM",
    priceCents: 4000,
    stock: 4,
    storeId: 2,
    storeSlug: "b",
    storeName: "B",
    storeCity: "CDMX",
    storeDataSource: "live",
    storeLat: null,
    storeLng: null,
    sellerId: 2,
    sellerName: "B",
    sellerType: "store",
    origin: "feed",
    ...p,
  };
}

describe("revalidar", () => {
  it("no reporta cambios cuando nada cambió", () => {
    const r = revalidar([renglon()], estado({ listingId: 100 }), []);
    assert.equal(r.hayCambios, false);
    assert.equal(r.renglones[0].cambio, "igual");
    assert.equal(r.subtotalAhora, r.subtotalAntes);
  });

  it("adopta el precio nuevo de la tienda y lo declara", () => {
    // El precio es de la tienda; lo que no se hace es cobrarlo sin enseñarlo.
    const r = revalidar([renglon()], estado({ listingId: 100, priceCents: 5000 }), []);
    assert.equal(r.renglones[0].cambio, "precio");
    assert.equal(r.renglones[0].precioAhora, 5000);
    assert.equal(r.subtotalAhora, 10_000);
    assert.ok(r.hayCambios);
  });

  it("baja la cantidad cuando ya no alcanzan todas", () => {
    const r = revalidar([renglon({ qty: 3 })], estado({ listingId: 100, stock: 1 }), []);
    assert.equal(r.renglones[0].cambio, "menos");
    assert.equal(r.renglones[0].qtyAhora, 1);
  });

  it("si se acabó, la mueve a otra tienda", () => {
    const r = revalidar(
      [renglon()],
      estado({ listingId: 100, stock: 0, inStock: false }),
      [fuente({ listingId: 200, cardId: 10, storeSlug: "b", priceCents: 4500 })],
    );
    const x = r.renglones[0];
    assert.equal(x.cambio, "movida");
    assert.equal(x.tiendaAhora, "b");
    assert.equal(x.precioAhora, 4500);
    assert.equal(x.fuente?.listingId, 200);
  });

  it("prefiere una tienda que YA está en el pedido, aunque cueste más", () => {
    // Mudarse a una tienda nueva suma otra recolección: concentrar es la
    // economía del mensajero, no una preferencia estética.
    const lines = [
      renglon({ id: 1, listingId: 100, storeSlug: "a" }),
      renglon({ id: 2, cardId: 20, cardName: "Otra", listingId: 101, storeSlug: "c" }),
    ];
    const actuales = new Map([
      [100, { listingId: 100, priceCents: 4000, stock: 0, inStock: false }],
      [101, { listingId: 101, priceCents: 4000, stock: 5, inStock: true }],
    ]);
    const r = revalidar(lines, actuales, [
      fuente({ listingId: 200, cardId: 10, storeSlug: "nueva", priceCents: 3000 }),
      fuente({ listingId: 201, cardId: 10, storeSlug: "c", priceCents: 4800 }),
    ]);
    assert.equal(r.renglones[0].tiendaAhora, "c");
    assert.equal(r.renglones[0].precioAhora, 4800);
  });

  it("entre tiendas nuevas, la más barata", () => {
    const r = revalidar(
      [renglon()],
      estado({ listingId: 100, stock: 0, inStock: false }),
      [
        fuente({ listingId: 200, cardId: 10, storeSlug: "cara", priceCents: 9000 }),
        fuente({ listingId: 201, cardId: 10, storeSlug: "barata", priceCents: 3000 }),
      ],
    );
    assert.equal(r.renglones[0].tiendaAhora, "barata");
  });

  it("si nadie la tiene, no se cobra", () => {
    const r = revalidar([renglon()], estado({ listingId: 100, stock: 0, inStock: false }), []);
    assert.equal(r.renglones[0].cambio, "perdida");
    assert.equal(r.renglones[0].qtyAhora, 0);
    assert.equal(r.subtotalAhora, 0);
    assert.equal(r.perdidas.length, 1);
  });

  it("un listado que ya no existe es una pérdida, no un renglón fantasma", () => {
    // La tienda lo borró: el id no vuelve de la base.
    const r = revalidar([renglon()], new Map(), []);
    assert.equal(r.renglones[0].cambio, "perdida");
  });

  it("no se mueve al mismo listado que se acabó", () => {
    const r = revalidar(
      [renglon()],
      estado({ listingId: 100, stock: 0, inStock: false }),
      [fuente({ listingId: 100, cardId: 10, storeSlug: "a", stock: 0 })],
    );
    assert.equal(r.renglones[0].cambio, "perdida");
  });

  it("el subtotal de después es el que se va a cobrar", () => {
    const lines = [
      renglon({ id: 1, listingId: 100, qty: 2, unitPriceCents: 1000 }),
      renglon({ id: 2, cardId: 20, listingId: 101, qty: 1, unitPriceCents: 5000 }),
    ];
    const actuales = new Map([
      [100, { listingId: 100, priceCents: 1200, stock: 5, inStock: true }],
      [101, { listingId: 101, priceCents: 5000, stock: 0, inStock: false }],
    ]);
    const r = revalidar(lines, actuales, []);
    assert.equal(r.subtotalAntes, 7000);
    assert.equal(r.subtotalAhora, 2400); // 2 × 1200, y la perdida no se cobra
  });
});

describe("huellaRevision", () => {
  it("no depende del orden de los renglones", () => {
    const uno = revalidar(
      [renglon({ id: 1 }), renglon({ id: 2, cardId: 20, listingId: 101 })],
      new Map([
        [100, { listingId: 100, priceCents: 4000, stock: 5, inStock: true }],
        [101, { listingId: 101, priceCents: 4000, stock: 5, inStock: true }],
      ]),
      [],
    );
    const otro = revalidar(
      [renglon({ id: 2, cardId: 20, listingId: 101 }), renglon({ id: 1 })],
      new Map([
        [101, { listingId: 101, priceCents: 4000, stock: 5, inStock: true }],
        [100, { listingId: 100, priceCents: 4000, stock: 5, inStock: true }],
      ]),
      [],
    );
    assert.equal(huellaRevision(uno), huellaRevision(otro));
  });

  it("cambia cuando cambia el precio", () => {
    const antes = revalidar([renglon()], estado({ listingId: 100 }), []);
    const despues = revalidar([renglon()], estado({ listingId: 100, priceCents: 4100 }), []);
    assert.notEqual(huellaRevision(antes), huellaRevision(despues));
  });

  it("cambia cuando la carta se mudó de tienda", () => {
    const antes = revalidar([renglon()], estado({ listingId: 100 }), []);
    const despues = revalidar(
      [renglon()],
      estado({ listingId: 100, stock: 0, inStock: false }),
      [fuente({ listingId: 200, cardId: 10, storeSlug: "b" })],
    );
    assert.notEqual(huellaRevision(antes), huellaRevision(despues));
  });
});
