import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import CardTile from "@/components/CardTile";
import SampleDataNotice from "@/components/SampleDataNotice";
import { getMultiStoreCards, getStats, isSampleData, listStoresPublic } from "@/lib/db/queries";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const SUGGESTED = ["Sol Ring", "Lightning Bolt", "Rhystic Study", "Cyclonic Rift"];

export default function HomePage() {
  const stats = getStats();
  const stores = listStoresPublic();
  const featured = getMultiStoreCards(10);
  const sample = isSampleData();

  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <section className="py-14 sm:py-20">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/70 px-3 py-1 text-xs text-ink-300">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          {stats.stores} tiendas mexicanas en un solo buscador
        </p>
        <h1 className="max-w-3xl text-4xl font-black leading-[1.1] tracking-tight sm:text-6xl">
          Encuentra tu carta sin ir{" "}
          <span className="text-brand-400">tienda por tienda</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-300 sm:text-lg">
          El stock de una sola tienda casi nunca alcanza. TCG Pool junta el
          catálogo de varias tiendas mexicanas y te dice, en una vista, quién
          tiene la carta, en qué versión y condición, y a qué precio.
        </p>

        <div className="mt-8 max-w-2xl">
          <SearchBox size="lg" />
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span>Prueba:</span>
            {SUGGESTED.map((name) => (
              <Link
                key={name}
                href={`/buscar?q=${encodeURIComponent(name)}`}
                className="rounded-full border border-ink-700 px-2.5 py-1 text-ink-300 transition hover:border-brand-600 hover:text-brand-400"
              >
                {name}
              </Link>
            ))}
          </div>
        </div>

        <dl className="mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Tiendas", stats.stores.toLocaleString("es-MX")],
            ["Cartas", stats.cards.toLocaleString("es-MX")],
            ["Listados", stats.listings.toLocaleString("es-MX")],
            ["Con stock", stats.inStock.toLocaleString("es-MX")],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-ink-800 bg-ink-900/50 px-4 py-3"
            >
              <dt className="text-xs text-ink-500">{label}</dt>
              <dd className="text-2xl font-bold tracking-tight">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-xs text-ink-500">
          Última sincronización: {timeAgo(stats.lastSyncedAt)}
        </p>

        {sample && (
          <div className="mt-6 max-w-3xl">
            <SampleDataNotice />
          </div>
        )}
      </section>

      {featured.length > 0 && (
        <section className="border-t border-ink-800/70 py-12">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                Repartidas entre varias tiendas
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Justo lo que no puedes ver desde el buscador de una sola tienda.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {featured.slice(0, 5).map((card) => (
              <CardTile key={card.id} card={card} />
            ))}
          </div>
        </section>
      )}

      <section className="border-t border-ink-800/70 py-12">
        <h2 className="text-xl font-bold tracking-tight">Tiendas conectadas</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stores.map((store) => (
            <Link
              key={store.id}
              href="/tiendas"
              className="rounded-2xl border border-ink-800 bg-ink-900/50 p-4 transition hover:border-brand-600/60 hover:bg-ink-850"
            >
              <p className="text-sm font-semibold">{store.name}</p>
              <p className="text-xs text-ink-500">{store.city ?? "México"}</p>
              <p className="mt-3 text-xs text-ink-300">
                <span className="font-semibold text-brand-400">
                  {store.inStockCount.toLocaleString("es-MX")}
                </span>{" "}
                listados con stock
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
