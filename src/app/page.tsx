import Link from "next/link";
import StoreList from "@/components/StoreList";
import LocationPicker from "@/components/LocationPicker";
import CardTile from "@/components/CardTile";
import { listStoresPublic } from "@/lib/db/queries";
import { getTrending } from "@/lib/trending";
import { getUserLocation } from "@/lib/location-server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const stores = await listStoresPublic();
  const trending = await getTrending(5);
  const location = await getUserLocation();

  return (
    <div>
      {/* El héroe se sale del contenedor a propósito: es la única banda a sangre
          de la casa, y la foto no funciona recortada a la caja de texto. */}
      <section className="relative isolate overflow-hidden bg-scrim">
        {/* La foto va como <img> y no como fondo de CSS para poder dar varios
            tamaños: quien abre esto está en la tienda, con datos. */}
        <img
          src="/hero-1280.webp"
          srcSet="/hero-800.webp 800w, /hero-1280.webp 1280w, /hero-1920.webp 1920w"
          sizes="100vw"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_100%]"
        />
        {/* Dos velos, los dos NEUTROS y lo más ligeros que aguanta el texto: el
            horizontal protege la columna izquierda, que es donde cae todo lo que
            se lee, y el vertical sólo cierra contra la barra y contra la sección
            clara de abajo. A la derecha se van a nada para que la foto se vea. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-r from-scrim/70 via-scrim/25 to-transparent"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-b from-scrim/55 via-transparent to-scrim/50"
        />

        {/* El padding de arriba deja pasar la barra, que flota encima. */}
        <div className="mx-auto w-full max-w-6xl aire pb-14 pt-32 sm:pb-20 sm:pt-36">
          <p className="sobre-foto text-xs font-semibold uppercase tracking-[0.14em] text-accent-night">
            Buscador de singles TCG en México
          </p>
          <h1 className="sobre-foto mt-3 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-night-ink text-balance sm:text-[46px]">
            Compra singles en múltiples tiendas de México en un solo lugar.
          </h1>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl aire">
        {trending.cards.length > 0 && (
          <section className="border-b border-line py-10">
            <h2 className="text-2xl font-bold tracking-tight">Cartas de moda</h2>
            <p className="mt-1 text-sm text-muted">
              {/* Cuando todavía no hay búsquedas que contar, el orden es por
                  disponibilidad y hay que decirlo: llamarlas "las más buscadas"
                  sin haber contado una sola búsqueda sería inventarlo. */}
              {trending.source === "demand"
                ? "Las más buscadas con stock en CDMX."
                : "Con stock en CDMX. Todavía no medimos búsquedas: por ahora, las que más tiendas tienen."}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {trending.cards.map((card) => (
                <CardTile key={card.id} card={card} />
              ))}
            </div>
          </section>
        )}

        <section className="py-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
            <h2 className="text-2xl font-bold tracking-tight">Tiendas</h2>
            {/* El selector vive aquí y no sólo en el pie: es donde la distancia
                está a la vista, o sea donde se nota para qué sirve decir dónde
                estás. */}
            <LocationPicker current={location} />
          </div>
          <div className="mt-3">
            <StoreList stores={stores} location={location} />
          </div>
        </section>
      </div>
    </div>
  );
}
