import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitFeedByConflicts } from "@/lib/ingest/conflicts";

const feed = (printingId: number, condition: string, externalId: string) => ({
  printingId,
  condition: condition as never,
  externalId,
});

describe("splitFeedByConflicts", () => {
  it("sin listados manuales, todo el feed entra", () => {
    const rows = [feed(1, "NM", "a"), feed(2, "LP", "b")];
    const { aplicables, conflictos } = splitFeedByConflicts(rows, []);
    assert.equal(aplicables.length, 2);
    assert.equal(conflictos.length, 0);
  });

  it("el feed NO pisa lo capturado a mano: levanta conflicto", () => {
    const rows = [feed(1, "NM", "shopify-1"), feed(2, "NM", "shopify-2")];
    const manual = [{ id: 77, printingId: 1, condition: "NM" }];
    const { aplicables, conflictos } = splitFeedByConflicts(rows, manual);

    assert.deepEqual(aplicables.map((r) => r.externalId), ["shopify-2"]);
    assert.deepEqual(conflictos, [{ row: rows[0], listingId: 77 }]);
  });

  it("la misma impresión en OTRA condición no es conflicto", () => {
    // Una tienda puede tener legítimamente la misma carta en NM y en LP como
    // dos listados distintos; sólo choca lo que es la misma cosa.
    const rows = [feed(1, "LP", "shopify-1")];
    const manual = [{ id: 77, printingId: 1, condition: "NM" }];
    const { aplicables, conflictos } = splitFeedByConflicts(rows, manual);

    assert.equal(aplicables.length, 1);
    assert.equal(conflictos.length, 0);
  });
});
