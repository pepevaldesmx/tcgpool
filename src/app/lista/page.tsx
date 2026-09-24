import Link from "next/link";
import type { Metadata } from "next";
import DeckPasteBox from "@/components/DeckPasteBox";
import { parseDecklist, type DeckLine } from "@/lib/decklist";
import {
  findCardByName,
  getCheapestByCardAndStore,
  type CardSummary,
  type CardStorePrice,
} from "@/lib/db/queries";
import { money } from "@/lib/format";
import { planFulfillment, type FulfillmentLine } from "@/lib/fulfillment";
import { formatDistance, proximityRank } from "@/lib/location";
import { getUserLocation } from "@/lib/location-server";
import { armarDesdeLista } from "@/app/comanda/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buscar una lista",
  description: "Pega tu decklist y mira qué tiendas mexicanas cubren más de tu lista.",
};

interface Props {
  searchParams: Promise<{ lista?: string }>;
}

interface LineResult {
  line: DeckLine;
  card: CardSummary | null;
  /** Precio más barato por tienda, sólo con stock. */
  prices: CardStorePrice[];
}

interface Coverage {
  storeSlug: string;
  storeName: string;
  storeCity: string | null;
  /** Cartas distintas de la lista que esta tienda tiene. */
  covered: number;
  /** Copias cubiertas (respetando la cantidad pedida). */
  copies: number;
  /** Costo de lo que sí tiene, a su precio. */
  subtotalCents: number;
}

export default async function DeckPage({ searchParams }: Props) {
  const raw = (await searchParams).lista?.trim() ?? "";
  const lines = raw ? parseDecklist(raw) : [];

  const results: LineResult[] = await Promise.all(
    lines.map(async (line) => ({
      line,
      card: await findCardByName(line.name),
      prices: [] as CardStorePrice[],
    })),
  );

  const cardIds = results.map((r) => r.card?.id).filter((id): id is number => id != null);
  const prices = await getCheapestByCardAndStore(cardIds);
  for (const r of results) {
    if (r.card) r.prices = prices.filter((p) => p.cardId === r.card!.id);
  }

  const found = results.filter((r) => r.card && r.prices.length > 0);
  const missing = results.filter((r) => !r.card || r.prices.length === 0);

  const location = await getUserLocation();

  const storeNames = new Map<
    string,
    { name: string; city: string | null; lat: number | null; lng: number | null }
  >();
  for (const p of prices)
    storeNames.set(p.storeSlug, {
      name: p.storeName,
      city: p.storeCity,
      lat: p.storeLat,
      lng: p.storeLng,
    });

  // Cercanía como desempate del plan: entre dos tiendas que surten lo mismo,
  // gana la de tu ciudad. Nunca a costa de cobertura.
  const storePriority = new Map<string, number>();
  for (const [slug, store] of storeNames) {
    storePriority.set(slug, proximityRank(location, store));
  }

  // Cobertura por tienda: cuánto de la lista tiene cada una por su cuenta.
  const coverage = new Map<string, Coverage>();
  for (const r of found) {
    for (const p of r.prices) {
      const c = coverage.get(p.storeSlug) ?? {
        storeSlug: p.storeSlug,
        storeName: p.storeName,
        storeCity: p.storeCity,
        covered: 0,
        copies: 0,
        subtotalCents: 0,
      };
      c.covered += 1;
      c.copies += r.line.qty;
      c.subtotalCents += p.priceCents * r.line.qty;
      coverage.set(p.storeSlug, c);
    }
  }
  const byCoverage = [...coverage.values()].sort(
    (a, b) => b.covered - a.covered || a.subtotalCents - b.subtotalCents,
  );

  // El plan: con qué tiendas se surte la lista en el menor número de pedidos.
  const fulfillmentLines: FulfillmentLine[] = results.map((r, i) => ({
    key: String(i),
    qty: r.line.qty,
    priceByStore: new Map(r.prices.map((p) => [p.storeSlug, p.priceCents])),
  }));
  const plan = planFulfillment(fulfillmentLines, { storePriority });

  // Dónde queda asignada cada carta dentro del plan.
  const assignment = new Map<string, { storeSlug: string; priceCents: number }>();
  for (const leg of plan.legs) {
    for (const key of leg.cardKeys) {
      const r = results[Number(key)];
      const price = r.prices.find((p) => p.storeSlug === leg.storeSlug)!;
      assignment.set(key, { storeSlug: leg.storeSlug, priceCents: price.priceCents });
    }
  }

  const totalCopies = lines.reduce((a, l) => a + l.qty, 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-4xl font-bold tracking-tight">Buscar una lista</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        Pega tu decklist completa y te decimos con qué tiendas la surtes en el
        menor número de pedidos, en vez de que revises tienda por tienda.
      </p>

      <div className="mt-6 max-w-3xl">
        <DeckPasteBox initialValue={raw} rows={raw ? 5 : 9} />
      </div>

      {raw && lines.length === 0 && (
        <p className="mt-8 text-sm text-muted">
          No pudimos leer ninguna carta de esa lista. Una carta por renglón, con o
          sin cantidad al principio.
        </p>
      )}

      {lines.length > 0 && (
        <>
          <section className="mt-10">
            <h2 className="text-2xl font-bold tracking-tight">
              Cómo surtir tu lista en menos pedidos
            </h2>
            <p className="mt-1 text-[15px] text-muted">
              {lines.length} cartas distintas · {totalCopies}{" "}
              {totalCopies === 1 ? "copia" : "copias"}
              {plan.legs.length > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-ink">
                    {plan.legs.length}{" "}
                    {plan.legs.length === 1 ? "tienda basta" : "tiendas bastan"}
                  </span>{" "}
                  para {plan.covered} de {lines.length}
                </>
              )}
            </p>

            {plan.legs.length > 0 ? (
              <ol className="mt-4 space-y-3">
                {plan.legs.map((leg, i) => {
                  const store = storeNames.get(leg.storeSlug);
                  return (
                    <li
                      key={leg.storeSlug}
                      className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface px-5 py-4 shadow-card"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-pill bg-accent text-[15px] font-bold text-accent-ink">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold">
                          {store?.name ?? leg.storeSlug}
                        </span>
                        <span className="block text-[13px] text-muted">
                          {store?.city ?? "México"}
                          {location && store && (
                            <>
                              {proximityRank(location, store) === 0 ? (
                                <span className="text-ok"> · en tu ciudad</span>
                              ) : proximityRank(location, store) < Number.MAX_SAFE_INTEGER ? (
                                <> · a {formatDistance(proximityRank(location, store))}</>
                              ) : null}
                            </>
                          )}{" "}
                          · {leg.cardKeys.length}{" "}
                          {leg.cardKeys.length === 1 ? "carta" : "cartas"} · {leg.copies}{" "}
                          {leg.copies === 1 ? "copia" : "copias"}
                        </span>
                      </span>
                      <span className="whitespace-nowrap text-right">
                        <span className="block text-[17px] font-bold tnum">
                          {money(leg.subtotalCents)}
                        </span>
                        <span className="block text-[12px] text-muted">en este pedido</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="mt-4 text-[15px] text-muted">
                Ninguna tienda conectada tiene cartas de esta lista en stock.
              </p>
            )}

            {plan.legs.length > 0 && (
              <p className="mt-3 text-[13px] text-muted">
                Total del plan{" "}
                <span className="font-semibold text-ink tnum">{money(plan.totalCents)}</span>
                {plan.uncovered.length > 0 && (
                  <>
                    {" · "}
                    {plan.uncovered.length}{" "}
                    {plan.uncovered.length === 1 ? "carta" : "cartas"} que ninguna tienda
                    tiene hoy
                  </>
                )}
                . Buscamos el menor número de pedidos, no el precio más bajo: partir la
                compra entre muchas tiendas sale más caro en envíos y esperas.
              </p>
            )}

            {plan.legs.length > 0 && (
              <form action={armarDesdeLista} className="mt-5">
                <input type="hidden" name="lista" value={raw} />
                <button
                  type="submit"
                  className="rounded-pill bg-accent px-6 py-2.5 text-[15px] font-semibold text-accent-ink shadow-card transition hover:shadow-lift"
                >
                  Armar mi comanda
                </button>
                <span className="ml-3 text-[13px] text-muted">
                  {plan.uncovered.length > 0
                    ? `Las ${plan.uncovered.length} que nadie tiene se van a tu wishlist.`
                    : "Puedes cambiar las fuentes antes de pagar."}
                </span>
              </form>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-bold tracking-tight">Cobertura por tienda</h2>
            <p className="mt-1 text-[15px] text-muted">
              Lo que tiene cada tienda de tu lista, por su cuenta.
            </p>

            {byCoverage.length > 0 ? (
              <div className="table-scroll mt-4 overflow-hidden rounded-card border border-line bg-surface shadow-card">
                <table className="w-full min-w-[680px] border-collapse text-[15px]">
                  <thead>
                    <tr className="border-b border-line bg-thead text-left text-[11px] uppercase tracking-[0.07em] text-muted">
                      <th className="px-4 py-2.5 font-semibold">Tienda</th>
                      <th className="px-4 py-2.5 font-semibold">Cobertura</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Copias</th>
                      <th className="px-4 py-2.5 text-right font-semibold">
                        Subtotal MXN
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCoverage.map((c) => (
                      <tr
                        key={c.storeSlug}
                        className="border-b border-line-soft last:border-0 hover:bg-hover"
                      >
                        <td className="px-4 py-3">
                          <div className="whitespace-nowrap font-semibold">{c.storeName}</div>
                          <div className="text-xs text-muted">
                            {c.storeCity ?? "México"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="h-2 w-32 overflow-hidden rounded-pill bg-surface-2">
                              <span
                                className="block h-full rounded-full bg-accent"
                                style={{ width: `${(c.covered / lines.length) * 100}%` }}
                              />
                            </span>
                            <span className="text-[13px] font-semibold tnum">
                              {c.covered} de {lines.length}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tnum">{c.copies}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-[17px] font-bold tnum">
                          {money(c.subtotalCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">
                Ninguna tienda conectada tiene cartas de esta lista en stock.
              </p>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-bold tracking-tight">Carta por carta</h2>
            <div className="table-scroll mt-4 overflow-hidden rounded-card border border-line bg-surface shadow-card">
              <table className="w-full min-w-[760px] border-collapse text-[15px]">
                <thead>
                  <tr className="border-b border-line bg-thead text-left text-[11px] uppercase tracking-[0.07em] text-muted">
                    <th className="px-4 py-2.5 text-right font-semibold">Cant.</th>
                    <th className="px-4 py-2.5 font-semibold">Carta</th>
                    <th className="px-4 py-2.5 font-semibold">Disponible en</th>
                    <th className="px-4 py-2.5 font-semibold">Según el plan</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Precio</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => {
                    // El precio que se muestra es el de la tienda que el plan
                    // le asignó, no el más barato del mercado: la tabla es el
                    // pedido, no una comparativa entre tiendas.
                    const assigned = assignment.get(String(i));
                    const assignedStore = assigned
                      ? storeNames.get(assigned.storeSlug)
                      : undefined;
                    return (
                      <tr
                        key={`${r.line.raw}-${i}`}
                        className="border-b border-line-soft last:border-0 hover:bg-hover"
                      >
                        <td className="px-4 py-3 text-right tnum">{r.line.qty}</td>
                        <td className="px-4 py-3">
                          {r.card ? (
                            <Link
                              href={`/carta/${r.card.slug}`}
                              className="font-semibold hover:text-accent"
                            >
                              {r.card.name}
                            </Link>
                          ) : (
                            <span className="text-muted">{r.line.name}</span>
                          )}
                          {r.card && r.card.name !== r.line.name && (
                            <div className="text-xs text-muted">
                              pediste “{r.line.name}”
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-muted">
                          {r.prices.length
                            ? `${r.prices.length} ${r.prices.length === 1 ? "tienda la tiene" : "tiendas la tienen"}`
                            : r.card
                              ? "sin stock ahora"
                              : "no está en el catálogo"}
                        </td>
                        <td className="px-4 py-3 text-[13px]">
                          {assignedStore ? (
                            <span className="font-semibold text-ink">
                              {assignedStore.name}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-[17px] font-bold tnum">
                          {assigned ? money(assigned.priceCents) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tnum">
                          {assigned ? money(assigned.priceCents * r.line.qty) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {missing.length > 0 && (
              <p className="mt-3 text-xs text-muted">
                {missing.length}{" "}
                {missing.length === 1 ? "renglón" : "renglones"} sin oferta hoy en
                las tiendas conectadas.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
