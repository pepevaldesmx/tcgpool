import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dedupeCards } from "@/lib/db/queries";

describe("dedupeCards", () => {
  it("colapsa nombres que normalizan igual", () => {
    // Magic tiene seis cartas distintas llamadas "Everythingamajig". Nuestra
    // tabla guarda una fila por nombre, y meter las seis en el mismo INSERT
    // aborta la sentencia entera con "cannot affect row a second time".
    const out = dedupeCards([
      { gameId: "magic", name: "Everythingamajig", typeLine: "Artifact" },
      { gameId: "magic", name: "Everythingamajig", typeLine: "Artifact" },
      { gameId: "magic", name: "Sol Ring" },
    ]);
    assert.deepEqual(out.map((c) => c.name), ["Everythingamajig", "Sol Ring"]);
  });

  it("la puntuación y los acentos no hacen cartas distintas", () => {
    const out = dedupeCards([
      { gameId: "magic", name: "Jötun Grunt" },
      { gameId: "magic", name: "Jotun Grunt" },
    ]);
    assert.equal(out.length, 1);
  });

  it("el mismo nombre en otro juego NO se colapsa", () => {
    const out = dedupeCards([
      { gameId: "magic", name: "Counterspell" },
      { gameId: "pokemon", name: "Counterspell" },
    ]);
    assert.equal(out.length, 2);
  });
});
