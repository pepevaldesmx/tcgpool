import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectColumns, parseCsv, parsePrice } from "@/lib/csv";

describe("parseCsv", () => {
  it("respeta las comas dentro de comillas", () => {
    // Partir por comas convertiría este renglón en cuatro campos y guardaría
    // "Jaya" como nombre de carta.
    const filas = parseCsv('nombre,precio\n"Jaya, Fiery Negotiator",180\n');
    assert.deepEqual(filas, [
      ["nombre", "precio"],
      ["Jaya, Fiery Negotiator", "180"],
    ]);
  });

  it("entiende las comillas escapadas", () => {
    const filas = parseCsv('nombre\n"Erase (Not the Urza""s Legacy One)"\n');
    assert.equal(filas[1][0], 'Erase (Not the Urza"s Legacy One)');
  });

  it("acepta punto y coma y tabulador, que es como exporta Excel en español", () => {
    assert.deepEqual(parseCsv("a;b\n1;2"), [["a", "b"], ["1", "2"]]);
    assert.deepEqual(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
  });

  it("se come el BOM de Excel", () => {
    // Sin esto el encabezado es "﻿nombre" y no empata con nada.
    const filas = parseCsv("﻿nombre,precio\nSol Ring,44");
    assert.equal(filas[0][0], "nombre");
  });

  it("no inventa un renglón con el salto de línea final", () => {
    assert.equal(parseCsv("a,b\n1,2\n").length, 2);
  });

  it("tolera CRLF", () => {
    assert.deepEqual(parseCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
  });
});

describe("detectColumns", () => {
  it("reconoce encabezados en español y en inglés", () => {
    assert.deepEqual(
      detectColumns(["Card Name", "Set", "Collector Number", "Condition", "Price MXN", "Qty"]),
      { nombre: 0, set: 1, numero: 2, condicion: 3, precio: 4, cantidad: 5 },
    );
    assert.deepEqual(detectColumns(["Nombre", "Edición", "Precio", "Cantidad"]), {
      nombre: 0,
      set: 1,
      precio: 2,
      cantidad: 3,
    });
  });

  it("ante dos columnas parecidas manda la primera", () => {
    const cols = detectColumns(["nombre", "precio", "precio con descuento"]);
    assert.equal(cols.precio, 1);
  });
});

describe("parsePrice", () => {
  it("lee los formatos que salen de una caja registradora", () => {
    assert.equal(parsePrice("$1,234.50"), 1234.5);
    assert.equal(parsePrice("45,00"), 45); // decimal con coma
    assert.equal(parsePrice("1.234,50"), 1234.5); // formato europeo
    assert.equal(parsePrice("99"), 99);
    assert.equal(parsePrice("  $ 44.00 MXN "), 44);
  });

  it("un precio que no es un precio no pasa", () => {
    assert.equal(parsePrice(""), null);
    assert.equal(parsePrice("gratis"), null);
    assert.equal(parsePrice("0"), null);
    assert.equal(parsePrice("-5"), null);
  });
});
