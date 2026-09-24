import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rutaSegura } from "@/lib/auth/origin";

describe("rutaSegura", () => {
  it("acepta rutas de esta app", () => {
    assert.equal(rutaSegura("/cuenta"), "/cuenta");
    assert.equal(rutaSegura("/tienda/mtg-mexico?t=abc"), "/tienda/mtg-mexico?t=abc");
  });

  it("no manda a otro dominio", () => {
    // Un link a `/entrar?next=https://otrositio` usaría nuestro login como
    // trampolín: la persona entra de verdad y acaba en otra parte.
    assert.equal(rutaSegura("https://otrositio.com/roba"), "/");
    assert.equal(rutaSegura("http://otrositio.com"), "/");
  });

  it("rechaza `//host`, que el navegador lee como otro dominio", () => {
    assert.equal(rutaSegura("//otrositio.com/roba"), "/");
  });

  it("cae al destino por defecto sin valor", () => {
    assert.equal(rutaSegura(null), "/");
    assert.equal(rutaSegura(undefined, "/cuenta"), "/cuenta");
    assert.equal(rutaSegura(""), "/");
  });
});
