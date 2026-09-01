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
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="max-w-2xl">
        <SearchBox initialQuery={q} autoFocus={!q} size="lg" />
      </div>

      {q && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">
            {results.length > 0 ? (
              <>
                {results.length} {results.length === 1 ? "carta" : "cartas"} para{" "}
                <span className="text-brand-400">“{q}”</span>
              </>
            ) : (
              <>
                Sin resultados para <span className="text-brand-400">“{q}”</span>
              </>
            )}
          </h1>
          <Link
            href={`/buscar?q=${encodeURIComponent(q)}${onlyInStock ? "" : "&stock=1"}`}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              onlyInStock
                ? "border-brand-600 bg-brand-600/15 text-brand-400"
                : "border-ink-700 text-ink-300 hover:border-ink-500"
            }`}
          >
            Sólo con stock
          </Link>
        </div>
      )}

      {q && results.length === 0 && (
        <div className="mt-6 rounded-2xl border border-ink-800 bg-ink-900/50 p-6 text-sm text-ink-300">
          <p>
            No encontramos esa carta en el catálogo que tenemos indexado. Puede
            que ninguna de las tiendas conectadas la tenga, o que esté escrita
            distinto en su sitio.
          </p>
          <p className="mt-2 text-ink-500">
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
        <p className="mt-8 text-sm text-ink-500">
          Escribe el nombre de una carta para ver qué tiendas la tienen.
        </p>
      )}
    </div>
  );
}
