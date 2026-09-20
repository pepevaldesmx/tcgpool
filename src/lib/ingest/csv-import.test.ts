import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { leerInventarioCsv } from "@/lib/ingest/csv-import";
import { normalizeText } from "@/lib/ingest/normalize";
import type { CatalogEntry } from "@/lib/db/queries";

const catalogo = (...nombres: string[]) =>
  new Map<string, CatalogEntry>(
    nombres.map((n, i) => [
      normalizeText(n),
      { id: i + 1, name: n, oracleId: null, typeLine: null, imageUrl: null },
    ]),
  );

describe("leerInventarioCsv", () => {
  const cat = catalogo("Sol Ring", "Jaya, Fiery Negotiator", "Avatar of Woe");

  it("lee un export típico", () => {
    const csv = [
      "Card Name,Set,Collector Number,Condition,Price MXN,Qty",
      "Sol Ring,Commander 2021,263,NM,44.00,3",
      '"Jaya, Fiery Negotiator",Dominaria United,137,LP,"1,250.00",1',
    ].join("\n");
    const r = leerInventarioCsv(csv, cat);

    assert.equal(r.filas.length, 2);
    assert.deepEqual(r.filas[0], {
      cardId: 1,
      cardName: "Sol Ring",
      setName: "Commander 2021",
      collectorNumber: "263",
      language: "en",
      finish: "nonfoil",
      condition: "NM",
      priceCents: 4400,
      stock: 3,
    });
    // El nombre con coma sobrevivió, y el precio con separador de miles también.
    assert.equal(r.filas[1].cardName, "Jaya, Fiery Negotiator");
    assert.equal(r.filas[1].priceCents, 125000);
  });

  it("reporta los nombres que no reconoce en vez de tragárselos", () => {
    const csv = "nombre,precio\nSol Ring,44\nCarta Inventada,10\nCarta Inventada,12";
    const r = leerInventarioCsv(csv, cat);
    assert.equal(r.filas.length, 1);
    assert.deepEqual(r.desconocidos, [{ nombre: "Carta Inventada", veces: 2 }]);
  });

  it("el catálogo reconoce el nombre aunque traiga adornos", () => {
    const r = leerInventarioCsv("nombre,precio\nAvatar of Woe (Pro Tour),300", cat);
    assert.equal(r.filas[0]?.cardName, "Avatar of Woe");
  });

  it("sin cantidad supone una, no cero", () => {
    // Suponer cero marcaría el archivo entero como agotado.
    const r = leerInventarioCsv("nombre,precio\nSol Ring,44", cat);
    assert.equal(r.filas[0].stock, 1);
  });

  it("cantidad cero se respeta: es 'la manejo pero no la tengo'", () => {
    const r = leerInventarioCsv("nombre,precio,cantidad\nSol Ring,44,0", cat);
    assert.equal(r.filas[0].stock, 0);
  });

  it("un precio ilegible descarta el renglón y lo cuenta", () => {
    const r = leerInventarioCsv("nombre,precio\nSol Ring,gratis\nSol Ring,44", cat);
    assert.equal(r.filas.length, 1);
    assert.equal(r.descartados, 1);
  });

  it("sin columna de nombre o de precio, no adivina", () => {
    assert.match(leerInventarioCsv("foo,bar\n1,2", cat).error ?? "", /nombre/);
    assert.match(leerInventarioCsv("nombre\nSol Ring", cat).error ?? "", /precio/);
  });

  it("lee el acabado y el idioma aunque vengan colgando del nombre", () => {
    const r = leerInventarioCsv("nombre,precio\nSol Ring (Foil) ESPAÑOL,90", cat);
    assert.equal(r.filas[0]?.cardName, "Sol Ring");
    assert.equal(r.filas[0]?.finish, "foil");
    assert.equal(r.filas[0]?.language, "es");
  });

  it("de una sola columna saca también set y número", () => {
    // Muchas tiendas exportan el título completo y nada más.
    const r = leerInventarioCsv("nombre,precio\nSol Ring (263) [Commander 2021],44", cat);
    assert.equal(r.filas[0]?.setName, "Commander 2021");
    assert.equal(r.filas[0]?.collectorNumber, "263");
  });
});
