/**
 * ¿Este dominio sirve un catálogo que podamos ingerir?
 *
 *   npm run probe -- tiendaejemplo.mx otra.com.mx
 *
 * Antes de agregar una tienda hay que saber tres cosas que sólo se averiguan
 * pegándole: si responde, si corre en Shopify (`/products.json` público) y qué
 * juegos declara en `product_type`, que es de donde sale la clasificación. Sin
 * esto, agregar una tienda es editar el registro y esperar a que el sync falle.
 *
 * No toca la base: es sólo red.
 */
const TIMEOUT_MS = 20_000;

interface Variant {
  available?: boolean;
}
interface Product {
  title?: string;
  product_type?: string;
  variants?: Variant[];
}

async function get(url: string): Promise<Response | null> {
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "tcgpool-probe/1.0 (+https://github.com/pepevaldesmx/tcgpool)" },
    });
  } catch (err) {
    console.log(`    ✗ ${(err as Error).message}`);
    return null;
  }
}

async function probe(domain: string) {
  const host = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  console.log(`\n▸ ${host}`);

  const home = await get(`https://${host}`);
  if (!home) return;
  console.log(`    home        ${home.status} → ${new URL(home.url).host}`);

  // El dominio final tras redirecciones es el que hay que guardar: pedirle
  // /products.json al que redirige devuelve el HTML de la redirección.
  const canonical = new URL(home.url).host;
  const feedUrl = `https://${canonical}/products.json?limit=250`;
  const feed = await get(feedUrl);
  if (!feed) return;

  const type = feed.headers.get("content-type") ?? "";
  console.log(`    products.json ${feed.status} · ${type.split(";")[0]}`);
  if (!feed.ok || !type.includes("json")) {
    console.log("    ✗ no sirve un feed de Shopify público");
    return;
  }

  let products: Product[];
  try {
    products = ((await feed.json()) as { products?: Product[] }).products ?? [];
  } catch {
    console.log("    ✗ el cuerpo no es JSON válido");
    return;
  }

  const disponibles = products.filter((p) => p.variants?.some((v) => v.available)).length;
  console.log(`    ✓ Shopify · ${products.length} productos en la página 1 · ${disponibles} con stock`);

  const tipos = new Map<string, number>();
  for (const p of products) tipos.set(p.product_type || "(sin tipo)", (tipos.get(p.product_type || "(sin tipo)") ?? 0) + 1);
  const top = [...tipos].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`    product_type: ${top.map(([t, n]) => `${t} ${n}`).join(" · ")}`);

  console.log("    títulos de muestra:");
  for (const p of products.slice(0, 6)) console.log(`      ${p.title}`);
}

async function main() {
  const domains = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (!domains.length) {
    console.error("Uso: npm run probe -- <dominio> [<dominio>...]");
    process.exit(1);
  }
  for (const d of domains) await probe(d);
}

main();
