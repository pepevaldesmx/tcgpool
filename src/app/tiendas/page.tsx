import type { Metadata } from "next";
import { listStoresPublic } from "@/lib/db/queries";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tiendas conectadas",
  description: "Qué tiendas mexicanas están indexadas en TCG Pool y cuándo se sincronizaron.",
};

const SOURCE_LABELS: Record<string, string> = {
  shopify: "Shopify · feed público",
  manual: "Captura manual",
  wix: "Wix · scraper",
};

export default function StoresPage() {
  const stores = listStoresPublic();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Tiendas conectadas</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-300">
        Cada tienda se ingiere con su propio adaptador. Las que corren en Shopify
        exponen un catálogo público (<code className="text-ink-100">/products.json</code>)
        que leemos directo; las demás necesitan un adaptador propio. Sumar una
        tienda nueva es una entrada más en{" "}
        <code className="text-ink-100">data/stores.json</code>.
      </p>

      <div className="table-scroll mt-8 rounded-2xl border border-ink-800">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-left text-xs uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3 font-medium">Tienda</th>
              <th className="px-4 py-3 font-medium">Fuente</th>
              <th className="px-4 py-3 text-right font-medium">Cartas</th>
              <th className="px-4 py-3 text-right font-medium">Listados</th>
              <th className="px-4 py-3 text-right font-medium">Con stock</th>
              <th className="px-4 py-3 font-medium">Sincronizada</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.id} className="border-b border-ink-800/70 last:border-0">
                <td className="px-4 py-3">
                  <a
                    href={store.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium hover:text-brand-400"
                  >
                    {store.name}
                  </a>
                  <div className="text-xs text-ink-500">{store.city ?? "México"}</div>
                </td>
                <td className="px-4 py-3 text-xs text-ink-300">
                  {SOURCE_LABELS[store.sourceType] ?? store.sourceType}
                </td>
                <td className="px-4 py-3 text-right">{store.cardCount}</td>
                <td className="px-4 py-3 text-right">{store.listingCount}</td>
                <td className="px-4 py-3 text-right font-semibold text-brand-400">
                  {store.inStockCount}
                </td>
                <td className="px-4 py-3 text-xs text-ink-500">
                  {timeAgo(store.lastSyncedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-10 rounded-2xl border border-ink-800 bg-ink-900/40 p-6">
        <h2 className="text-lg font-semibold">¿Tienes una tienda?</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-300">
          No necesitamos que cambies nada de tu sitio: si corres en Shopify ya
          publicas el catálogo que leemos. Cada listado manda el tráfico a tu
          página de producto — el cierre de la venta sigue siendo tuyo.
        </p>
      </section>
    </div>
  );
}
