import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import DeckPasteBox from "@/components/DeckPasteBox";
import StoreList from "@/components/StoreList";
import SampleDataNotice from "@/components/SampleDataNotice";
import CardTile from "@/components/CardTile";
import GameMark from "@/components/GameMark";
import {
  getTrendingCards,
  isSampleData,
  listGames,
  listStoresPublic,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const SUGGESTED = ["Sol Ring", "Lightning Bolt", "Rhystic Study", "Cyclonic Rift"];

export default function HomePage() {
  const stores = listStoresPublic();
  const games = listGames();
  const trending = getTrendingCards(5);
  const sample = isSampleData();

  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <section className="border-b border-line pb-10 pt-12 sm:pt-16">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          Buscador de singles TCG en México
        </p>
        <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
          Encuentra tu carta en tiendas mexicanas y afiliados.
        </h1>

        {/* Los dos motores, uno debajo del otro: primero la carta suelta,
            que es el caso común; la lista completa queda a un scroll corto. */}
        <div className="mt-8 max-w-3xl">
          <SearchBox size="lg" />
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Prueba:</span>
            {SUGGESTED.map((name) => (
              <Link
                key={name}
                href={`/buscar?q=${encodeURIComponent(name)}`}
                className="rounded-sm border border-line bg-surface px-2.5 py-1 text-ink transition hover:border-accent hover:text-accent"
              >
                {name}
              </Link>
            ))}
          </div>

          <div className="mt-7 rounded border border-line bg-surface p-5">
            <h2 className="font-serif text-base font-semibold">
              ¿Traes la lista completa?
            </h2>
            <p className="mt-1 text-sm text-muted">
              Pégala entera y te decimos qué tienda cubre más y cuánto costaría.
            </p>
            <div className="mt-3.5">
              <DeckPasteBox rows={5} />
            </div>
          </div>
        </div>

        {sample && (
          <div className="mt-7 max-w-3xl">
            <SampleDataNotice />
          </div>
        )}
      </section>

      {trending.cards.length > 0 && (
        <section className="border-b border-line py-9">
          <h2 className="font-serif text-xl font-semibold tracking-tight">
            Cartas de moda
          </h2>
          <p className="mt-1 text-sm text-muted">
            {trending.source === "demand"
              ? "Las más buscadas que están disponibles ahora."
              : "Todavía no medimos búsquedas: por ahora, las que más tiendas tienen en stock."}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {trending.cards.map((card) => (
              <CardTile key={card.id} card={card} />
            ))}
          </div>
        </section>
      )}

      <section className="border-b border-line py-9">
        <h2 className="font-serif text-xl font-semibold tracking-tight">Juegos</h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          {games.map((game) => {
            const live = game.inStockCount > 0;
            return (
              <li
                key={game.id}
                className={`flex items-center gap-3.5 rounded border border-line bg-surface px-4 py-3.5 ${
                  live ? "" : "opacity-55"
                }`}
              >
                <GameMark gameId={game.id} />
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-[15px] font-semibold leading-tight">
                    {game.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {live
                      ? `${game.cardCount.toLocaleString("es-MX")} cartas · ${game.inStockCount.toLocaleString("es-MX")} listados con stock`
                      : "sin tiendas conectadas todavía"}
                  </p>
                </div>
                {!live && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                    pronto
                  </span>
                )}
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
