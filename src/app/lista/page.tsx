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

  const results: LineResult[] = lines.map((line) => ({
    line,
    card: findCardByName(line.name),
    prices: [],
  }));

  const cardIds = results.map((r) => r.card?.id).filter((id): id is number => id != null);
  const prices = getCheapestByCardAndStore(cardIds);
  for (const r of results) {
    if (r.card) r.prices = prices.filter((p) => p.cardId === r.card!.id);
  }

  const found = results.filter((r) => r.card && r.prices.length > 0);
  const missing = results.filter((r) => !r.card || r.prices.length === 0);

  // Cobertura por tienda: lo que de verdad responde "¿a quién le compro?".
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

  const totalCopies = lines.reduce((a, l) => a + l.qty, 0);
  // Comprando cada carta donde esté más barata, sin importar cuántas tiendas.
  const bestTotal = found.reduce(
    (sum, r) => sum + Math.min(...r.prices.map((p) => p.priceCents)) * r.line.qty,
    0,
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">
        Buscar una lista
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Pega tu decklist completa y te decimos qué tienda cubre más de la lista y
        cuánto costaría, en vez de que revises tienda por tienda.
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
            <h2 className="font-serif text-xl font-semibold tracking-tight">
              Qué tienda cubre más de tu lista
            </h2>
            <p className="mt-1 text-sm text-muted">
              {lines.length} cartas distintas · {totalCopies}{" "}
              {totalCopies === 1 ? "copia" : "copias"}
              {found.length > 0 && (
                <>
                  {" · "}comprando cada una donde esté más barata:{" "}
                  <span className="font-mono font-bold text-ink tnum">
                    {money(bestTotal)}
                  </span>
                </>
              )}
            </p>

            {byCoverage.length > 0 ? (
              <div className="table-scroll mt-4 rounded border border-line bg-surface">
                <table className="w-full min-w-[600px] border-collapse text-sm">
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
                          <div className="font-semibold">{c.storeName}</div>
                          <div className="text-xs text-muted">
                            {c.storeCity ?? "México"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
                              <span
                                className="block h-full rounded-full bg-accent"
                                style={{ width: `${(c.covered / lines.length) * 100}%` }}
                              />
                            </span>
                            <span className="font-mono text-xs tnum">
                              {c.covered} de {lines.length}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tnum">{c.copies}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold tnum">
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
            <h2 className="font-serif text-xl font-semibold tracking-tight">
              Carta por carta
            </h2>
            <div className="table-scroll mt-4 rounded border border-line bg-surface">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-thead text-left text-[11px] uppercase tracking-[0.07em] text-muted">
                    <th className="px-4 py-2.5 text-right font-semibold">Cant.</th>
                    <th className="px-4 py-2.5 font-semibold">Carta</th>
                    <th className="px-4 py-2.5 font-semibold">Tiendas</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Más barata</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => {
                    const min = r.prices.length
                      ? Math.min(...r.prices.map((p) => p.priceCents))
                      : null;
                    const cheapestStore = r.prices.find((p) => p.priceCents === min);
                    return (
                      <tr
                        key={`${r.line.raw}-${i}`}
                        className="border-b border-line-soft last:border-0 hover:bg-hover"
                      >
                        <td className="px-4 py-3 text-right font-mono tnum">
                          {r.line.qty}
                        </td>
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
                        <td className="px-4 py-3 text-xs text-muted">
                          {r.prices.length
                            ? r.prices
                                .slice()
                                .sort((a, b) => a.priceCents - b.priceCents)
                                .map((p) => p.storeName)
                                .join(" · ")
                            : r.card
                              ? "sin stock ahora"
                              : "no está en el catálogo"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold tnum">
                          {min != null ? money(min) : "—"}
                          {cheapestStore && (
                            <div className="font-sans text-[11px] font-normal text-muted">
                              {cheapestStore.storeName}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tnum">
                          {min != null ? money(min * r.line.qty) : "—"}
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
