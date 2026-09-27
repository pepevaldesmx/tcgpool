import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ciudadDeCodigoPostal, esCodigoPostal } from "@/lib/postal";

describe("ciudadDeCodigoPostal", () => {
  it("reconoce la Ciudad de México de punta a punta", () => {
    // Del 01 al 16: Álvaro Obregón hasta Cuajimalpa, todas son CDMX.
    for (const cp of ["01000", "03100", "06700", "11560", "16000"]) {
      assert.equal(ciudadDeCodigoPostal(cp)?.city, "CDMX", cp);
    }
  });

  it("reconoce las otras ciudades de la lista", () => {
    assert.equal(ciudadDeCodigoPostal("44100")?.city, "Guadalajara");
    assert.equal(ciudadDeCodigoPostal("64000")?.city, "Monterrey");
    assert.equal(ciudadDeCodigoPostal("72000")?.city, "Puebla");
    assert.equal(ciudadDeCodigoPostal("97000")?.city, "Mérida");
  });

  it("devuelve las coordenadas de la ciudad, no del código", () => {
    const cdmx = ciudadDeCodigoPostal("06700")!;
    assert.ok(Math.abs(cdmx.lat - 19.4326) < 0.001);
    assert.ok(Math.abs(cdmx.lng + 99.1332) < 0.001);
  });

  it("no adivina un código que no conocemos", () => {
    // Adivinar mandaría al comprador a ordenar tiendas por una ciudad que no es
    // la suya, y sin que nada se lo diga.
    assert.equal(ciudadDeCodigoPostal("99999"), null);
    assert.equal(ciudadDeCodigoPostal("50000"), null);
  });

  it("rechaza lo que no es un código postal", () => {
    for (const malo of ["", "123", "123456", "abcde", "0670a", "  "]) {
      assert.equal(ciudadDeCodigoPostal(malo), null, malo);
      assert.equal(esCodigoPostal(malo), false, malo);
    }
  });

  it("tolera espacios alrededor", () => {
    assert.equal(ciudadDeCodigoPostal("  06700 ")?.city, "CDMX");
  });
});
