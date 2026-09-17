import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPanelStats,
  getStoreByPanelToken,
  listPendingConflicts,
  listStoreInventory,
} from "@/lib/db/queries";
import { conditionLabel, moneyExact } from "@/lib/format";
import { timeAgo } from "@/lib/format";
import { resolveConflictAction, deleteListingAction } from "./actions";
import CaptureForm from "@/components/panel/CaptureForm";

export const dynamic = "force-dynamic";

// El panel no se indexa: se entra con un link secreto, y un buscador que lo
// encuentre haría inútil el secreto.
export const metadata: Metadata = {
  title: "Panel de tienda",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string; q?: string; agotadas?: string }>;
}

export default async function PanelPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { t = "", q = "", agotadas } = await searchParams;
  const includeSoldOut = agotadas === "1";

  const store = await getStoreByPanelToken(t);
  // Mismo 404 para token inválido y tienda inexistente: decir "token incorrecto"
  // confirmaría que la tienda existe y convertiría esto en un oráculo.
  if (!store || store.slug !== slug) notFound();

  const [stats, conflicts, inventory] = await Promise.all([
    getPanelStats(store.id),
    listPendingConflicts(store.id),
    listStoreInventory(store.id, { q, limit: 60, includeSoldOut }),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <p className="text-[11px] uppercase tracking-[0.09em] text-muted">Panel de tienda</p>
      <h1 className="mt-1 text-4xl font-bold tracking-tight">{store.name}</h1>
      <p className="mt-2 text-sm text-muted">
        {store.city ?? "Sin ciudad"} · última importación{" "}
        {store.lastSyncedAt ? timeAgo(store.lastSyncedAt) : "nunca"}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Cartas", stats.cards],
          ["Listados", stats.listings],
          ["Con stock", stats.inStock],
          ["Capturados a mano", stats.manual],
        ].map(([label, value]) => (
          <div key={label} className="rounded-card border border-line bg-surface px-4 py-3 shadow-card">
            <dt className="text-[13px] text-muted">{label}</dt>
            <dd className="mt-0.5 text-[26px] font-bold tnum">
              {Number(value).toLocaleString("es-MX")}
            </dd>
          </div>
        ))}
      </dl>

      {/* Las advertencias van arriba de todo: son lo único que espera una
          decisión, y enterradas bajo el inventario no se resolverían nunca. */}
      <section className="mt-10">
        <h2 className="text-xl font-bold">
          Diferencias con tu tienda en línea
          {conflicts.length > 0 && (
            <span className="ml-2 rounded-pill bg-warn px-2.5 py-0.5 align-middle text-[13px] font-semibold text-paper">
              {conflicts.length}
            </span>
          )}
        </h2>

        {conflicts.length === 0 ? (
          <p className="mt-2 text-[15px] text-muted">
            Nada pendiente. Cuando la importación encuentre una carta que tú
            capturaste y que tu tienda en línea contradice, lo que capturaste se
            queda publicado y aquí te preguntamos cuál gana.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {conflicts.map((c) => (
              <li
                key={c.id}
                className="rounded-card border border-line bg-surface p-4 shadow-card"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[17px] font-semibold">{c.cardName}</p>
                  <p className="text-[13px] text-muted">
                    {[c.setName, c.language, c.finish === "foil" ? "foil" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-control border border-line-soft px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.07em] text-muted">
                      Lo que capturaste
                    </p>
                    <p className="mt-0.5 font-semibold tnum">
                      {moneyExact(c.minePriceCents)} · {conditionLabel(c.mineCondition)} ·{" "}
                      {c.mineInStock ? `${c.mineStock} pz` : "agotada"}
                    </p>
                  </div>
                  <div className="rounded-control border border-line-soft px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.07em] text-muted">
                      Lo que dice tu tienda en línea
                    </p>
                    <p className="mt-0.5 font-semibold tnum">
                      {moneyExact(c.feedPriceCents)} · {conditionLabel(c.feedCondition)} ·{" "}
                      {c.feedInStock ? `${c.feedStock} pz` : "agotada"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={resolveConflictAction}>
                    <input type="hidden" name="token" value={t} />
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="conflictId" value={c.id} />
                    <input type="hidden" name="resolution" value="manual" />
                    <button
                      type="submit"
                      className="rounded-pill border border-accent bg-accent px-4 py-1.5 text-[13px] font-semibold text-accent-ink shadow-card"
                    >
                      Me quedo con lo mío
                    </button>
                  </form>
                  <form action={resolveConflictAction}>
                    <input type="hidden" name="token" value={t} />
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="conflictId" value={c.id} />
                    <input type="hidden" name="resolution" value="feed" />
                    <button
                      type="submit"
                      className="rounded-pill border border-line bg-surface px-4 py-1.5 text-[13px] font-semibold text-muted shadow-card transition hover:border-accent hover:text-accent"
                    >
                      Usar lo de mi tienda en línea
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-bold">Capturar una carta</h2>
        <p className="mt-1 text-[15px] text-muted">
          Lo que captures aquí manda: la importación de tu tienda en línea no lo
          pisa nunca.
        </p>
        <CaptureForm token={t} slug={slug} />
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
          <h2 className="text-xl font-bold">Tu inventario</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/tienda/${slug}?t=${encodeURIComponent(t)}${q ? `&q=${encodeURIComponent(q)}` : ""}${includeSoldOut ? "" : "&agotadas=1"}`}
              className={`rounded-pill border px-4 py-1.5 text-[13px] font-semibold shadow-card transition ${
                includeSoldOut
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-line bg-surface text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {includeSoldOut ? "Viendo agotadas" : "Ver agotadas"}
            </Link>
            <form className="flex gap-2">
              <input type="hidden" name="t" value={t} />
              {includeSoldOut && <input type="hidden" name="agotadas" value="1" />}
              <input
                name="q"
                defaultValue={q}
                placeholder="Buscar en tu inventario"
                className="rounded-control border border-line bg-surface px-3 py-1.5 text-[14px]"
              />
              <button
                type="submit"
                className="rounded-pill border border-line bg-surface px-4 py-1.5 text-[13px] font-semibold text-muted shadow-card"
              >
                Buscar
              </button>
            </form>
          </div>
        </div>

        <div className="table-scroll mt-4 overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <table className="w-full min-w-[720px] border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-line bg-thead text-left text-[11px] uppercase tracking-[0.07em] text-muted">
                <th className="px-4 py-2.5 font-semibold">Carta</th>
                <th className="px-4 py-2.5 font-semibold">Versión</th>
                <th className="px-4 py-2.5 font-semibold">Estado</th>
                <th className="px-4 py-2.5 text-right font-semibold">Precio</th>
                <th className="px-4 py-2.5 text-right font-semibold">Stock</th>
                <th className="px-4 py-2.5 font-semibold">Origen</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {inventory.map((l) => (
                <tr key={l.id} className="border-b border-line-soft last:border-0">
                  <td className="px-4 py-2.5 font-medium">{l.cardName}</td>
                  <td className="px-4 py-2.5 text-[13px] text-muted">
                    {[l.setName, l.language, l.finish === "foil" ? "foil" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </td>
                  <td className="px-4 py-2.5 text-[13px]">{conditionLabel(l.condition)}</td>
                  <td className="px-4 py-2.5 text-right tnum">{moneyExact(l.priceCents)}</td>
                  <td className="px-4 py-2.5 text-right tnum">
                    {l.inStock ? l.stock : <span className="text-muted">agotada</span>}
                  </td>
                  <td className="px-4 py-2.5 text-[13px]">
                    {l.origin === "manual" ? (
                      <span className="rounded-pill border border-accent px-2 py-0.5 text-[11px] font-semibold text-accent">
                        capturada
                      </span>
                    ) : (
                      <span className="text-muted">tienda en línea</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {l.origin === "manual" && (
                      <form action={deleteListingAction}>
                        <input type="hidden" name="token" value={t} />
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="listingId" value={l.id} />
                        <button
                          type="submit"
                          className="text-[13px] font-semibold text-muted transition hover:text-warn"
                        >
                          Dar de baja
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {inventory.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-[15px] text-muted">
                    {q ? `Nada que empate con “${q}”.` : "Todavía no hay inventario."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
