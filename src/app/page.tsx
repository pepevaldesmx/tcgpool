import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import DeckPasteBox from "@/components/DeckPasteBox";
import StoreList from "@/components/StoreList";
import SampleDataNotice from "@/components/SampleDataNotice";
import { isSampleData, listGames, listStoresPublic } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const SUGGESTED = ["Sol Ring", "Lightning Bolt", "Rhystic Study", "Cyclonic Rift"];

export default function HomePage() {
  const stores = listStoresPublic();
  const games = listGames();
  const sample = isSampleData();

  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <section className="border-b border-line pb-10 pt-12 sm:pt-16">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          Buscador de singles TCG en México
        </p>
        <h1 className="mt-3 max-w-4xl font-serif text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
          Encuentra tu carta en tiendas mexicanas y afiliados.
        </h1>

        {/* Dos motores de búsqueda: carta suelta y lista completa. */}
        <div className="mt-9 grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col rounded border border-line bg-surface p-5">
            <h2 className="font-serif text-lg font-semibold">Carta por carta</h2>
            <p className="mt-1 text-sm text-muted">
              Escribe el nombre y mira quién la tiene, en qué versión y a qué precio.
            </p>
            <div className="mt-4">
              <SearchBox size="lg" />
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs text-muted">
              <span>Prueba:</span>
              {SUGGESTED.map((name) => (
                <Link
                  key={name}
                  href={`/buscar?q=${encodeURIComponent(name)}`}
                  className="rounded-sm border border-line px-2.5 py-1 text-ink transition hover:border-accent hover:text-accent"
                >
                  {name}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-col rounded border border-line bg-surface p-5">
            <h2 className="font-serif text-lg font-semibold">Pega tu lista</h2>
            <p className="mt-1 text-sm text-muted">
              Tu decklist completa de un jalón: te decimos qué tienda cubre más y
              cuánto costaría.
            </p>
            <div className="mt-4">
              <DeckPasteBox rows={6} />
            </div>
          </div>
        </div>

        {sample && (
          <div className="mt-6 max-w-3xl">
            <SampleDataNotice />
          </div>
        )}
      </section>

      <section className="border-b border-line py-9">
        <h2 className="font-serif text-xl font-semibold tracking-tight">Juegos</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {games.map((game) => {
            const live = game.inStockCount > 0;
            return (
              <li
                key={game.id}
                className={`rounded border border-line bg-surface px-4 py-3 ${
                  live ? "" : "opacity-60"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-serif text-[15px] font-semibold">
                    {game.name}
                  </span>
                  {live ? (
                    <span className="font-mono text-sm font-bold text-accent tnum">
                      {game.inStockCount.toLocaleString("es-MX")}
                    </span>
                  ) : (
                    <span className="text-[11px] uppercase tracking-wide text-muted">
                      próximamente
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {live
                    ? `${game.cardCount.toLocaleString("es-MX")} cartas · listados con stock`
                    : "sin tiendas conectadas todavía"}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="py-9">
        <h2 className="font-serif text-xl font-semibold tracking-tight">Tiendas</h2>
        <div className="mt-3">
          <StoreList stores={stores} />
        </div>
      </section>
    </div>
  );
}
