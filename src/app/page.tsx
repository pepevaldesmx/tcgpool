import Link from "next/link";
import DeckPasteBox from "@/components/DeckPasteBox";
import StoreList from "@/components/StoreList";
import SampleDataNotice from "@/components/SampleDataNotice";
import CardTile from "@/components/CardTile";
import GameMark from "@/components/GameMark";
import { getProvenance, listGames, listStoresPublic } from "@/lib/db/queries";
import { getTrending } from "@/lib/trending";
import { getUserLocation } from "@/lib/location-server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [stores, games, provenance] = await Promise.all([
    listStoresPublic(),
    listGames(),
    getProvenance(),
  ]);
  const trending = await getTrending(5);
  const location = await getUserLocation();

  return (
    <div>
      {/* El héroe se sale del contenedor a propósito: es la única banda a sangre
          de la casa, y la foto no funciona recortada a la caja de texto. */}
      <section className="relative isolate overflow-hidden bg-night">
        {/* La foto va como <img> y no como fondo de CSS para poder dar varios
            tamaños: quien abre esto está en la tienda, con datos. */}
        <img
          src="/hero-1280.webp"
          srcSet="/hero-800.webp 800w, /hero-1280.webp 1280w, /hero-1920.webp 1920w"
          sizes="100vw"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[70%_38%] opacity-45"
        />
        {/* Dos velos, no uno: el vertical asienta el texto sobre la parte densa
            de la foto, y el horizontal protege la columna izquierda, que es
            donde cae todo lo que se lee. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-r from-night via-night/85 to-night/35"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-b from-night/70 via-transparent to-night"
        />

        {/* El padding de arriba deja pasar la barra, que flota encima. */}
        <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-32 sm:pb-20 sm:pt-36">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-night">
            Buscador de singles TCG en México
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-night-ink text-balance sm:text-[46px]">
            Compra singles en múltiples tiendas de México en un solo lugar.
          </h1>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="mt-8 rounded-card border border-line bg-surface p-6 shadow-card">
          <h2 className="text-lg font-bold">¿Traes la lista completa?</h2>
          <p className="mt-1 text-[15px] text-muted">
            Pégala entera y te decimos con qué tiendas la surtes en menos pedidos.
          </p>
          <div className="mt-3.5">
            <DeckPasteBox rows={5} />
          </div>
        </div>

        {provenance.sample > 0 && (
          <div className="mt-7 max-w-3xl">
            <SampleDataNotice provenance={provenance} />
          </div>
        )}

      {trending.cards.length > 0 && (
        <section className="border-b border-line py-9">
          <h2 className="text-2xl font-bold tracking-tight">Cartas de moda</h2>
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
        <h2 className="text-2xl font-bold tracking-tight">Juegos</h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          {games.map((game) => {
            const live = game.inStockCount > 0;
            return (
              <li
                key={game.id}
                className={`flex items-center gap-4 rounded-card border border-line bg-surface px-5 py-4 shadow-card ${
                  live ? "" : "opacity-55"
                }`}
              >
                <GameMark gameId={game.id} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-tight">{game.name}</p>
                  <p className="mt-0.5 text-[13px] text-muted">
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
          <h2 className="text-2xl font-bold tracking-tight">Tiendas</h2>
          <div className="mt-3">
            <StoreList stores={stores} location={location} />
          </div>
        </section>
      </div>
    </div>
  );
}
