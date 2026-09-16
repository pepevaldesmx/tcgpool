import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planFulfillment, type FulfillmentLine } from "./fulfillment";

const line = (key: string, qty: number, prices: Record<string, number>): FulfillmentLine => ({
  key,
  qty,
  priceByStore: new Map(Object.entries(prices)),
});

describe("planFulfillment", () => {
  it("prefiere una tienda que surte todo sobre dos más baratas", () => {
    const plan = planFulfillment([
      line("a", 1, { completa: 100, barata1: 10 }),
      line("b", 1, { completa: 100, barata2: 10 }),
    ]);
    assert.equal(plan.legs.length, 1);
    assert.equal(plan.legs[0].storeSlug, "completa");
    assert.equal(plan.covered, 2);
  });

  it("a igualdad de cobertura, escoge la más barata", () => {
    const plan = planFulfillment([
      line("a", 2, { cara: 100, barata: 40 }),
      line("b", 1, { cara: 100, barata: 40 }),
    ]);
    assert.equal(plan.legs[0].storeSlug, "barata");
    assert.equal(plan.legs[0].copies, 3);
    assert.equal(plan.legs[0].subtotalCents, 40 * 2 + 40);
  });

  it("agrega una segunda tienda sólo por lo que la primera no tiene", () => {
    const plan = planFulfillment([
      line("a", 1, { grande: 10 }),
      line("b", 1, { grande: 10 }),
      line("c", 1, { chica: 99 }),
    ]);
    assert.equal(plan.legs.length, 2);
    assert.equal(plan.legs[0].storeSlug, "grande");
    assert.deepEqual(plan.legs[1].cardKeys, ["c"]);
    assert.equal(plan.covered, 3);
  });

  it("reporta lo que nadie tiene sin inventar tiendas", () => {
    const plan = planFulfillment([line("a", 1, { x: 10 }), line("fantasma", 1, {})]);
    assert.deepEqual(plan.uncovered, ["fantasma"]);
    assert.equal(plan.covered, 1);
  });

  it("una lista vacía no revienta", () => {
    const plan = planFulfillment([]);
    assert.deepEqual(plan.legs, []);
    assert.equal(plan.covered, 0);
    assert.equal(plan.totalCents, 0);
  });
});

describe("planFulfillment con cercanía", () => {
  it("a igualdad de cobertura prefiere la tienda cercana, aunque sea más cara", () => {
    const plan = planFulfillment(
      [line("a", 1, { lejos: 10, cerca: 90 }), line("b", 1, { lejos: 10, cerca: 90 })],
      { storePriority: new Map([["cerca", 0], ["lejos", 460]]) },
    );
    assert.equal(plan.legs[0].storeSlug, "cerca");
  });

  it("pero NUNCA sacrifica cobertura por cercanía", () => {
    const plan = planFulfillment(
      [
        line("a", 1, { lejos: 10, cerca: 10 }),
        line("b", 1, { lejos: 10 }),
        line("c", 1, { lejos: 10 }),
      ],
      { storePriority: new Map([["cerca", 0], ["lejos", 900]]) },
    );
    assert.equal(plan.legs[0].storeSlug, "lejos");
    assert.equal(plan.legs[0].cardKeys.length, 3);
    assert.equal(plan.legs.length, 1);
  });
});
