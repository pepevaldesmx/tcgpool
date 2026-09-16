import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  distanceKm,
  parseLocation,
  proximityRank,
  serializeLocation,
} from "./location";

const cdmx = { lat: 19.4326, lng: -99.1332 };
const gdl = { lat: 20.6597, lng: -103.3496 };

describe("distanceKm", () => {
  it("mide CDMX–Guadalajara en el orden correcto de magnitud", () => {
    const km = distanceKm(cdmx, gdl);
    assert.ok(km > 450 && km < 500, `esperaba ~460 km, dio ${km}`);
  });
});

describe("parseLocation", () => {
  it("redondea a ~1 km al guardar y al leer", () => {
    const raw = serializeLocation({ lat: 19.432612345, lng: -99.133287, source: "gps" });
    assert.equal(parseLocation(raw)?.lat, 19.43);
    assert.equal(parseLocation(raw)?.lng, -99.13);
  });

  it("no confía en la cookie: basura entra, null sale", () => {
    for (const bad of [undefined, "", "{", "null", '{"lat":"x","lng":1}', '{"lat":null}'])
      assert.equal(parseLocation(bad as string), null, String(bad));
  });
});

describe("proximityRank", () => {
  const store = (city: string | null, lat: number, lng: number) => ({ city, lat, lng });

  it("sin ubicación todas las tiendas empatan", () => {
    assert.equal(proximityRank(null, store("CDMX", ...[19.43, -99.13] as [number, number])), 0);
  });

  it("la misma ciudad gana sobre la distancia en línea recta", () => {
    const loc = { city: "CDMX", ...cdmx, source: "city" as const };
    assert.equal(proximityRank(loc, store("CDMX", 19.5, -99.2)), 0);
    assert.ok(proximityRank(loc, store("Guadalajara", gdl.lat, gdl.lng)) > 400);
  });

  it("una tienda sin coordenadas no se cuela al frente", () => {
    const loc = { city: "CDMX", ...cdmx, source: "city" as const };
    assert.equal(
      proximityRank(loc, { city: "Otra", lat: null, lng: null }),
      Number.MAX_SAFE_INTEGER,
    );
  });
});
