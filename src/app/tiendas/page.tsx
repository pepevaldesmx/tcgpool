import type { Metadata } from "next";
import { MARCA } from "@/lib/brand";
import { listStoresPublic } from "@/lib/db/queries";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tiendas conectadas",
  description: `Qué tiendas mexicanas están indexadas en ${MARCA} y cuándo se sincronizaron.`,
};

const SOURCE_LABELS: Record<string, string> = {
  shopify: "Shopify · feed público",
  manual: "Captura manual",
  wix: "Wix · scraper",
};

export default async function StoresPage() {
  const stores = await listStoresPublic();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="text-4xl font-bold tracking-tight">Tiendas conectadas</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Cada tienda se ingiere con su propio adaptador. Las que corren en Shopify
        exponen un catálogo público (
        <code className="font-mono text-ink">/products.json</code>) que leemos
        directo; las demás necesitan un adaptador propio. Sumar una tienda nueva es
        una entrada más en <code className="font-mono text-ink">data/stores.json</code>.
      </p>

      <div className="table-scroll mt-7 overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <table className="w-full min-w-[760px] border-collapse text-[15px]">
          <thead>
            <tr className="border-b border-line bg-thead text-left text-[11px] uppercase tracking-[0.07em] text-muted">
              <th className="px-4 py-2.5 font-semibold">Tienda</th>
              <th className="px-4 py-2.5 font-semibold">Fuente</th>
              <th className="px-4 py-2.5 text-right font-semibold">Cartas</th>
              <th className="px-4 py-2.5 text-right font-semibold">Listados</th>
              <th className="px-4 py-2.5 text-right font-semibold">Con stock</th>
              <th className="px-4 py-2.5 font-semibold">Sincronizada</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.id} className="border-b border-line-soft last:border-0 hover:bg-hover">
                <td className="px-4 py-3">
                  <a
                    href={store.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold hover:text-accent"
                  >
                    {store.name}
                  </a>
                  <div className="text-xs text-muted">{store.city ?? "México"}</div>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {SOURCE_LABELS[store.sourceType] ?? store.sourceType}
                </td>
                <td className="px-4 py-3 text-right tnum">{store.cardCount}</td>
                <td className="px-4 py-3 text-right tnum">{store.listingCount}</td>
                <td className="px-4 py-3 text-right font-bold text-accent tnum">
                  {store.inStockCount}
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {timeAgo(store.lastSyncedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-8 rounded-card border border-line bg-surface p-6 shadow-card">
        <h2 className="text-xl font-bold">¿Tienes una tienda?</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          No necesitamos que cambies nada de tu sitio: si corres en Shopify ya
          publicas el catálogo que leemos. Cada listado manda el tráfico a tu
          página de producto — el cierre de la venta sigue siendo tuyo.
        </p>
      </section>
    </div>
  );
}
