import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SearchBox from "@/components/SearchBox";
import SampleDataNotice from "@/components/SampleDataNotice";
import {
  getCardBySlug,
  getListingsForCard,
  isSampleData,
  type ListingFilters,
  type ListingRow,
} from "@/lib/db/queries";
import { conditionLabel, finishLabel, languageLabel, money, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

type Query = Record<string, string | undefined>;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Query>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const card = getCardBySlug(slug);
  if (!card) return { title: "Carta no encontrada" };
  return {
    title: card.name,
    description: `${card.name}: qué tiendas mexicanas la tienen, en qué versión y a qué precio.`,
  };
}

/** Construye un href conservando los filtros actuales y cambiando uno. */
function withParam(slug: string, current: Query, key: string, value?: string) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) if (v) next.set(k, v);
  if (value) next.set(key, value);
  else next.delete(key);
  const qs = next.toString();
  return `/carta/${slug}${qs ? `?${qs}` : ""}`;
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border px-2.5 py-1 text-xs transition ${
        active
          ? "border-brand-600 bg-brand-600/15 text-brand-400"
          : "border-ink-700 text-ink-300 hover:border-ink-500 hover:text-ink-100"
      }`}
    >
      {children}
    </Link>
  );
}

function ConditionBadge({ condition }: { condition: string }) {
  const tone =
    condition === "NM"
      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
      : condition === "LP"
        ? "bg-sky-500/15 text-sky-300 ring-sky-500/30"
        : condition === "UNKNOWN"
          ? "bg-ink-700/40 text-ink-300 ring-ink-600/40"
          : "bg-amber-500/15 text-amber-300 ring-amber-500/30";
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${tone}`}>
      {conditionLabel(condition)}
    </span>
  );
}

export default async function CardPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;

  const card = getCardBySlug(slug);
  if (!card) notFound();

  const filters: ListingFilters = {
    onlyInStock: query.stock !== "0",
    storeSlugs: query.tienda ? [query.tienda] : undefined,
    conditions: query.cond ? [query.cond] : undefined,
    finish: (query.acabado as ListingFilters["finish"]) ?? "all",
    language: query.idioma ?? "all",
    sort: (query.orden as ListingFilters["sort"]) ?? "price_asc",
  };

  const listings = getListingsForCard(card.id, filters);
  // Las facetas se calculan sobre TODO el inventario de la carta, no sobre el
  // resultado filtrado: si no, al filtrar desaparecerían las demás opciones.
  const all = getListingsForCard(card.id, { onlyInStock: false });
  const facets = {
    stores: dedupe(all.map((l) => [l.storeSlug, l.storeName] as const)),
    conditions: dedupe(all.map((l) => [l.condition, conditionLabel(l.condition)] as const)),
    languages: dedupe(all.map((l) => [l.language, languageLabel(l.language)] as const)),
    finishes: dedupe(all.map((l) => [l.finish, finishLabel(l.finish)] as const)),
  };

  const cheapest = listings.find((l) => l.inStock === 1);
  const spread =
    card.minPriceCents != null && card.maxPriceCents != null && card.minPriceCents > 0
      ? Math.round(((card.maxPriceCents - card.minPriceCents) / card.minPriceCents) * 100)
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="max-w-2xl">
        <SearchBox size="sm" />
      </div>

      <nav className="mt-6 text-xs text-ink-500">
        <Link href="/" className="hover:text-ink-300">
          Inicio
        </Link>
        <span className="px-1.5">/</span>
        <Link href="/buscar" className="hover:text-ink-300">
          Buscar
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-ink-300">{card.name}</span>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="aspect-[63/88] overflow-hidden rounded-2xl border border-ink-800 bg-ink-850">
            {card.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.imageUrl}
                alt={card.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center px-4 text-center text-sm text-ink-500">
                {card.name}
              </div>
            )}
          </div>

          <h1 className="mt-4 text-2xl font-bold leading-tight tracking-tight">
            {card.name}
          </h1>
          {card.typeLine && <p className="text-sm text-ink-500">{card.typeLine}</p>}

          <dl className="mt-4 space-y-2 rounded-2xl border border-ink-800 bg-ink-900/50 p-4 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-ink-500">Más barata</dt>
              <dd className="text-xl font-bold text-brand-400">
                {money(card.minPriceCents)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-ink-500">Tiendas</dt>
              <dd className="font-semibold">{card.storeCount}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-ink-500">Listados con stock</dt>
              <dd className="font-semibold">{card.inStockCount}</dd>
            </div>
            {spread != null && spread > 0 && (
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-500">Diferencia máx.</dt>
                <dd className="font-semibold text-accent-400">+{spread}%</dd>
              </div>
            )}
          </dl>

          {cheapest && (
            <a
              href={cheapest.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-brand-400"
            >
              Ver la más barata en {cheapest.storeName}
            </a>
          )}
        </aside>

        <section>
          {isSampleData() && (
            <div className="mb-5">
              <SampleDataNotice />
            </div>
          )}

          <div className="space-y-3 rounded-2xl border border-ink-800 bg-ink-900/40 p-4">
            <FilterRow label="Orden">
              {(
                [
                  ["price_asc", "Precio ↑"],
                  ["price_desc", "Precio ↓"],
                  ["store", "Tienda"],
                ] as const
              ).map(([value, label]) => (
                <Chip
                  key={value}
                  href={withParam(slug, query, "orden", value)}
                  active={(query.orden ?? "price_asc") === value}
                >
                  {label}
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="Tienda">
              <Chip href={withParam(slug, query, "tienda")} active={!query.tienda}>
                Todas
              </Chip>
              {facets.stores.map(([value, label]) => (
                <Chip
                  key={value}
                  href={withParam(slug, query, "tienda", value)}
                  active={query.tienda === value}
                >
                  {label}
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="Condición">
              <Chip href={withParam(slug, query, "cond")} active={!query.cond}>
                Todas
              </Chip>
              {facets.conditions.map(([value, label]) => (
                <Chip
                  key={value}
                  href={withParam(slug, query, "cond", value)}
                  active={query.cond === value}
                >
                  {label}
                </Chip>
              ))}
            </FilterRow>

            {facets.languages.length > 1 && (
              <FilterRow label="Idioma">
                <Chip href={withParam(slug, query, "idioma")} active={!query.idioma}>
                  Todos
                </Chip>
                {facets.languages.map(([value, label]) => (
                  <Chip
                    key={value}
                    href={withParam(slug, query, "idioma", value)}
                    active={query.idioma === value}
                  >
                    {label}
                  </Chip>
                ))}
              </FilterRow>
            )}

            {facets.finishes.length > 1 && (
              <FilterRow label="Acabado">
                <Chip href={withParam(slug, query, "acabado")} active={!query.acabado}>
                  Todos
                </Chip>
                {facets.finishes.map(([value, label]) => (
                  <Chip
                    key={value}
                    href={withParam(slug, query, "acabado", value)}
                    active={query.acabado === value}
                  >
                    {label}
                  </Chip>
                ))}
              </FilterRow>
            )}

            <FilterRow label="Stock">
              <Chip href={withParam(slug, query, "stock")} active={query.stock !== "0"}>
                Sólo disponibles
              </Chip>
              <Chip
                href={withParam(slug, query, "stock", "0")}
                active={query.stock === "0"}
              >
                Incluir agotados
              </Chip>
            </FilterRow>
          </div>

          <p className="mt-5 text-sm text-ink-500">
            {listings.length} {listings.length === 1 ? "listado" : "listados"}
          </p>

          <div className="table-scroll mt-2 rounded-2xl border border-ink-800">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-800 text-left text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-3 font-medium">Tienda</th>
                  <th className="px-4 py-3 font-medium">Versión</th>
                  <th className="px-4 py-3 font-medium">Condición</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 text-right font-medium">Precio MXN</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {listings.map((listing, index) => (
                  <ListingRowView
                    key={listing.id}
                    listing={listing}
                    cheapest={index === 0 && listing.inStock === 1 && filters.sort !== "store"}
                  />
                ))}
                {listings.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                      Ningún listado con esos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-ink-500">{label}</span>
      {children}
    </div>
  );
}

function ListingRowView({ listing, cheapest }: { listing: ListingRow; cheapest: boolean }) {
  return (
    <tr
      className={`border-b border-ink-800/70 last:border-0 transition hover:bg-ink-850/60 ${
        listing.inStock ? "" : "opacity-45"
      }`}
    >
      <td className="px-4 py-3">
        <div className="font-medium">{listing.storeName}</div>
        <div className="text-xs text-ink-500">
          {listing.storeCity ?? "México"}
          {listing.sellerType === "affiliate" && ` · afiliado ${listing.sellerName}`}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="max-w-[260px] truncate" title={listing.setName ?? ""}>
          {listing.setName ?? "Set no especificado"}
        </div>
        <div className="text-xs text-ink-500">
          {languageLabel(listing.language)} · {finishLabel(listing.finish)}
          {listing.collectorNumber ? ` · #${listing.collectorNumber}` : ""}
        </div>
      </td>
      <td className="px-4 py-3">
        <ConditionBadge condition={listing.condition} />
      </td>
      <td className="px-4 py-3 text-xs">
        {listing.inStock ? (
          <span className="text-emerald-400">Disponible</span>
        ) : (
          <span className="text-ink-500">Agotada</span>
        )}
        <div className="text-ink-500">{timeAgo(listing.updatedAt)}</div>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-base font-bold">{money(listing.priceCents)}</span>
        {cheapest && (
          <span className="ml-2 rounded-md bg-brand-600/20 px-1.5 py-0.5 text-[10px] font-semibold text-brand-400">
            más barata
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <a
          href={listing.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-100 transition hover:border-brand-600 hover:text-brand-400"
        >
          Ver
        </a>
      </td>
    </tr>
  );
}

function dedupe(pairs: ReadonlyArray<readonly [string, string]>): Array<[string, string]> {
  const map = new Map<string, string>();
  for (const [value, label] of pairs) if (!map.has(value)) map.set(value, label);
  return [...map.entries()];
}
