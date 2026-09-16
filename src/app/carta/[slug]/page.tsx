import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SearchBox from "@/components/SearchBox";
import SampleDataNotice from "@/components/SampleDataNotice";
import TrackCardView from "@/components/TrackCardView";
import StoreLink from "@/components/StoreLink";
import {
  getCardBySlug,
  getListingsForCard,
  getProvenance,
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
      className={`rounded-pill border px-3.5 py-1.5 text-[13px] transition ${
        active
          ? "border-accent bg-accent font-semibold text-accent-ink"
          : "border-line bg-surface text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </Link>
  );
}

function ConditionBadge({ condition }: { condition: string }) {
  const nm = condition === "NM";
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-pill border px-2.5 py-1 text-[12px] font-medium ${
        nm
          ? "border-ok-line bg-ok-bg text-ok"
          : "border-line bg-surface-2 text-muted"
      }`}
    >
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
    // Por defecto agrupamos por tienda, no por precio: el objetivo es que el
    // pedido se concentre en pocas tiendas, no que compitan entre ellas.
    sort: (query.orden as ListingFilters["sort"]) ?? "store",
  };

  const provenance = getProvenance();
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

  // Un listado cualquiera con stock, para el botón. NO el más barato: no
  // queremos coronar a una tienda ni empujar a las demás a bajar precio.
  const available = listings.find((l) => l.inStock === 1);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <TrackCardView slug={slug} />
      <div className="max-w-2xl">
        <SearchBox size="sm" />
      </div>

      <nav className="mt-5 text-xs text-muted">
        <Link href="/" className="hover:text-accent">
          Inicio
        </Link>
        <span className="px-1.5">/</span>
        <Link href="/buscar" className="hover:text-accent">
          Buscar
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-ink">{card.name}</span>
      </nav>

      <div className="mt-4 grid gap-9 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="aspect-[63/88] overflow-hidden rounded-card border border-line bg-surface-2 shadow-lift">
            {card.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.imageUrl}
                alt={card.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center px-4 text-center text-sm text-muted">
                {card.name}
              </div>
            )}
          </div>

          <h1 className="mt-5 text-[32px] font-bold leading-tight tracking-tight">
            {card.name}
          </h1>
          {card.typeLine && <p className="mt-0.5 text-[15px] text-muted">{card.typeLine}</p>}

          <dl className="mt-5 rounded-card border border-line bg-surface px-5 py-3 shadow-card">
            <div className="flex items-baseline justify-between border-b border-line-soft py-2">
              <dt className="text-[15px] text-muted">Tiendas que la tienen</dt>
              <dd className="text-[26px] font-bold tnum">{card.storeCount}</dd>
            </div>
            <div className="flex items-baseline justify-between border-b border-line-soft py-2">
              <dt className="text-[15px] text-muted">Listados con stock</dt>
              <dd className="font-semibold tnum">{card.inStockCount}</dd>
            </div>
            {/* El rango se muestra como dato, no como ranking: sin "la más
                barata" ni el porcentaje de diferencia, que era publicidad de
                dispersión de precios. */}
            <div className="flex items-baseline justify-between py-2">
              <dt className="text-[15px] text-muted">Rango de precio</dt>
              <dd className="font-semibold tnum">
                {money(card.minPriceCents)} – {money(card.maxPriceCents)}
              </dd>
            </div>
          </dl>

          {available && (
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              Elige la tienda que más te convenga de la lista. Si traes varias
              cartas,{" "}
              <Link href="/lista" className="font-semibold text-accent hover:underline">
                busca la lista completa
              </Link>{" "}
              y te decimos con qué tiendas la surtes en menos pedidos.
            </p>
          )}
        </aside>

        <section>
          {provenance.sample > 0 && (
            <div className="mb-5">
              <SampleDataNotice provenance={provenance} />
            </div>
          )}

          <div className="space-y-3 rounded-card border border-line bg-surface px-5 py-4 shadow-card">
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

          <p className="mt-6 text-[15px] text-muted">
            {listings.length} {listings.length === 1 ? "listado" : "listados"}
          </p>

          <div className="table-scroll mt-3 overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <table className="w-full min-w-[820px] border-collapse text-[15px]">
              <thead>
                <tr className="border-b border-line bg-thead text-left text-[11px] uppercase tracking-[0.07em] text-muted">
                  <th className="px-4 py-2.5 font-semibold">Tienda</th>
                  <th className="px-4 py-2.5 font-semibold">Versión</th>
                  <th className="px-4 py-2.5 font-semibold">Condición</th>
                  <th className="px-4 py-2.5 font-semibold">Stock</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Precio MXN</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <ListingRowView key={listing.id} listing={listing} cardSlug={slug} />
                ))}
                {listings.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted">
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
      <span className="w-[78px] shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

function ListingRowView({ listing, cardSlug }: { listing: ListingRow; cardSlug: string }) {
  return (
    <tr
      className={`border-b border-line-soft transition last:border-0 hover:bg-hover ${
        listing.inStock ? "" : "opacity-45"
      }`}
    >
      <td className="px-4 py-4">
        <div className="whitespace-nowrap font-semibold">{listing.storeName}</div>
        <div className="text-xs text-muted">
          {listing.storeCity ?? "México"}
          {listing.sellerType === "affiliate" && ` · afiliado ${listing.sellerName}`}
        </div>
        {listing.storeDataSource !== "live" && (
          <span
            title="Precio y stock sintéticos: esta tienda todavía no se ingiere en vivo"
            className="mt-1 inline-block rounded-pill border border-warn-line bg-warn-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn"
          >
            demo
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="max-w-[260px] truncate" title={listing.setName ?? ""}>
          {listing.setName ?? "Set no especificado"}
        </div>
        <div className="text-xs text-muted">
          {languageLabel(listing.language)} · {finishLabel(listing.finish)}
          {listing.collectorNumber ? ` · #${listing.collectorNumber}` : ""}
        </div>
      </td>
      <td className="px-4 py-3">
        <ConditionBadge condition={listing.condition} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs">
        {listing.inStock ? (
          <span className="text-ok">Disponible</span>
        ) : (
          <span className="text-muted">Agotada</span>
        )}
        <div className="text-muted">{timeAgo(listing.updatedAt)}</div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <span className="text-[17px] font-bold tnum">{money(listing.priceCents)}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <StoreLink
          href={listing.productUrl}
          slug={cardSlug}
          className="rounded-pill border border-line bg-surface px-4 py-2 text-[13px] font-semibold transition hover:border-accent hover:text-accent"
        >
          Ver
        </StoreLink>
      </td>
    </tr>
  );
}

function dedupe(pairs: ReadonlyArray<readonly [string, string]>): Array<[string, string]> {
  const map = new Map<string, string>();
  for (const [value, label] of pairs) if (!map.has(value)) map.set(value, label);
  return [...map.entries()];
}
