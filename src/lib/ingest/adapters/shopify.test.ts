import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { fetchShopifyFeed } from "@/lib/ingest/adapters/shopify";

const page = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i, title: `p${i}`, handle: `p${i}`, variants: [] }));

/** Sirve respuestas por página; `fail` dice qué páginas devuelven 500. */
function fakeFetch(pages: Record<number, number>, fail: Set<number> = new Set()) {
  const intentos: number[] = [];
  const fn = async (url: string | URL) => {
    const n = Number(new URL(String(url)).searchParams.get("page"));
    intentos.push(n);
    if (fail.has(n)) return new Response("boom", { status: 500 });
    return Response.json({ products: page(pages[n] ?? 0) });
  };
  return { fn: fn as unknown as typeof fetch, intentos };
}

describe("fetchShopifyFeed", () => {
  it("un error a la mitad devuelve lo que alcanzó, marcado como parcial", async () => {
    const { fn } = fakeFetch({ 1: 250, 2: 250 }, new Set([3]));
    mock.method(globalThis, "fetch", fn);
    const cortes: number[] = [];
    const feed = await fetchShopifyFeed(
      { domain: "x.mx" },
      { backoffMs: 1, onPartial: (p) => cortes.push(p) },
    );
    mock.restoreAll();

    // Perder 500 productos ya descargados porque la página 3 falló dejaría a la
    // tienda entera fuera del buscador por un error pasajero.
    assert.equal(feed.products.length, 500);
    assert.equal(feed.partial, true);
    assert.deepEqual(cortes, [3]);
  });

  it("reintenta una página que falla y sigue de largo si se recupera", async () => {
    let fallos = 0;
    const fn = (async (url: string | URL) => {
      const n = Number(new URL(String(url)).searchParams.get("page"));
      if (n === 2 && fallos++ === 0) return new Response("boom", { status: 500 });
      return Response.json({ products: page(n === 1 ? 250 : 10) });
    }) as unknown as typeof fetch;
    mock.method(globalThis, "fetch", fn);
    const feed = await fetchShopifyFeed({ domain: "x.mx" }, { backoffMs: 1 });
    mock.restoreAll();

    assert.equal(feed.products.length, 260);
    assert.equal(feed.partial, undefined);
  });

  it("si la PRIMERA página falla, truena: no es un feed parcial, es un dominio muerto", async () => {
    const { fn } = fakeFetch({}, new Set([1]));
    mock.method(globalThis, "fetch", fn);
    await assert.rejects(() => fetchShopifyFeed({ domain: "x.mx" }, { backoffMs: 1 }), /HTTP 500/);
    mock.restoreAll();
  });

  it("un 404 no se reintenta: es definitivo", async () => {
    let llamadas = 0;
    const fn = (async () => {
      llamadas++;
      return new Response("nope", { status: 404 });
    }) as unknown as typeof fetch;
    mock.method(globalThis, "fetch", fn);
    await assert.rejects(() => fetchShopifyFeed({ domain: "x.mx" }, { backoffMs: 1 }));
    mock.restoreAll();
    assert.equal(llamadas, 1);
  });
});
