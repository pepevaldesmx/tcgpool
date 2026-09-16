import Link from "next/link";
import type { Metadata } from "next";
import SearchBox from "@/components/SearchBox";
import CardTile from "@/components/CardTile";
import { searchCards } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ q?: string; stock?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `“${q}”` : "Buscar cartas" };
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const onlyInStock = params.stock === "1";
  const results = q ? searchCards(q, { limit: 60, onlyInStock }) : [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="max-w-2xl">
        <SearchBox initialQuery={q} autoFocus={!q} size="lg" />
      </div>

      {q && (
        <div className="mt-7 flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
          <h1 className="text-xl font-bold">
            {results.length > 0 ? (
              <>
                {results.length} {results.length === 1 ? "carta" : "cartas"} para “{q}”
              </>
            ) : (
              <>Sin resultados para “{q}”</>
            )}
          </h1>
          <Link
            href={`/buscar?q=${encodeURIComponent(q)}${onlyInStock ? "" : "&stock=1"}`}
            className={`rounded-pill border px-4 py-1.5 text-[13px] font-semibold shadow-card transition ${
              onlyInStock
                ? "border-accent bg-accent text-accent-ink"
                : "border-line bg-surface text-muted hover:border-accent hover:text-accent"
            }`}
          >
            Sólo con stock
          </Link>
        </div>
      )}

      {q && results.length === 0 && (
        <div className="mt-6 rounded-card border border-line bg-surface p-6 text-[15px] text-ink shadow-card">
          <p>
            No encontramos esa carta en el catálogo que tenemos indexado. Puede
            que ninguna de las tiendas conectadas la tenga, o que esté escrita
            distinto en su sitio.
          </p>
          <p className="mt-2 text-muted">
            Tip: busca por el nombre en inglés — así la titulan casi todas las
            tiendas mexicanas.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {results.map((card) => (
            <CardTile key={card.id} card={card} />
          ))}
        </div>
      )}

      {!q && (
        <p className="mt-8 text-sm text-muted">
          Escribe el nombre de una carta para ver qué tiendas la tienen.
        </p>
      )}
    </div>
  );
}
