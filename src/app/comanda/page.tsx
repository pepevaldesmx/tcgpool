import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth/session";
import { getOpenComanda, type ComandaLine } from "@/lib/db/comandas";
import { getSourceListings, type SourceListing } from "@/lib/db/queries";
import { conditionLabel, money } from "@/lib/format";
import { ENTREGAS, ETIQUETA_ENTREGA, costoEntrega } from "@/lib/comanda/money";
import { agregarAWishlist } from "@/app/wishlist/actions";
import { cambiarCantidad, cambiarFuente, elegirEntrega, quitarRenglon } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi comanda",
  robots: { index: false, follow: false },
};

function detalle(l: ComandaLine): string {
  const partes = [l.setName, l.collectorNumber ? `#${l.collectorNumber}` : null].filter(Boolean);
  if (l.finish && l.finish !== "nonfoil") partes.push(l.finish === "foil" ? "Foil" : l.finish);
  if (l.language && l.language !== "en") partes.push(l.language.toUpperCase());
  return partes.join(" · ");
}

export default async function ComandaPage({
  searchParams,
}: {
  searchParams: Promise<{ faltan?: string }>;
}) {
  const sesion = await getSesion();
  if (!sesion) redirect("/entrar?next=%2Fcomanda");

  const { faltan } = await searchParams;
  const faltantes = (faltan ?? "").split("\n").filter(Boolean);
  const comanda = await getOpenComanda(sesion.user.id);
  const lines = comanda?.lines ?? [];

  // Todas las fuentes de todas las cartas de la comanda en UNA consulta: una por
  // renglón serían cien viajes de red para una lista de Commander.
  const cardIds = [...new Set(lines.map((l) => l.cardId).filter((id): id is number => id != null))];
  const sources = cardIds.length ? await getSourceListings(cardIds) : [];
  const alternativas = new Map<number, SourceListing[]>();
  for (const s of sources) {
    alternativas.set(s.cardId, [...(alternativas.get(s.cardId) ?? []), s]);
  }

  // Agrupado por tienda: es como se recoge y como se paga, no una lista plana.
  const porTienda = new Map<string, { nombre: string; ciudad: string | null; lines: ComandaLine[] }>();
  for (const l of lines) {
    const key = l.storeSlug ?? "?";
    const grupo = porTienda.get(key) ?? {
      nombre: l.storeName ?? "Sin tienda",
      ciudad: l.storeCity,
      lines: [],
    };
    grupo.lines.push(l);
    porTienda.set(key, grupo);
  }

  const copias = lines.reduce((n, l) => n + l.qty, 0);
  const d = comanda?.desglose;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Mi comanda</h1>
      <p className="mt-2 text-[15px] text-muted">
        {lines.length === 0
          ? "Todavía no tiene cartas."
          : `${lines.length} ${lines.length === 1 ? "renglón" : "renglones"} · ${copias} ${
              copias === 1 ? "copia" : "copias"
            } · ${comanda!.tiendas} ${comanda!.tiendas === 1 ? "fuente" : "fuentes"}`}
      </p>

      {faltantes.length > 0 && (
        <div className="mt-6 rounded-card border border-warn-line bg-warn-bg px-5 py-4">
          <p className="text-[15px] font-semibold text-warn">
            {faltantes.length}{" "}
            {faltantes.length === 1
              ? "carta de tu lista no la tiene nadie hoy"
              : "cartas de tu lista no las tiene nadie hoy"}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">
            No es una falla: las cartas vienen en sobres y el inventario de una
            tienda es el azar de lo que abrió. Guárdalas en tu wishlist y te
            avisamos cuando aparezca cualquier versión.
          </p>
          <ul className="mt-2 max-h-40 overflow-y-auto text-[13px] text-muted">
            {faltantes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <form action={agregarAWishlist} className="mt-3">
            <input type="hidden" name="nombres" value={faltantes.join("\n")} />
            <input type="hidden" name="origen" value="comanda" />
            <input type="hidden" name="volverA" value="/comanda" />
            <button
              type="submit"
              className="rounded-pill bg-accent px-4 py-2 text-[14px] font-semibold text-accent-ink shadow-card transition hover:shadow-lift"
            >
              Guardar en mi wishlist
            </button>
          </form>
        </div>
      )}

      {lines.length === 0 ? (
        <p className="mt-8 rounded-card border border-line bg-surface px-5 py-6 text-[15px] leading-relaxed text-muted shadow-card">
          Pega tu lista y te armamos la comanda desde la menor cantidad de fuentes
          posible.{" "}
          <Link href="/lista" className="font-semibold text-accent underline">
            Buscar una lista
          </Link>{" "}
          o{" "}
          <Link href="/buscar" className="font-semibold text-accent underline">
            una carta suelta
          </Link>
          .
        </p>
      ) : (
        <>
          {[...porTienda.entries()].map(([slug, grupo]) => (
            <section key={slug} className="mt-8">
              <h2 className="text-[17px] font-bold">
                {grupo.nombre}
                <span className="ml-2 text-[13px] font-medium text-muted">
                  {grupo.ciudad ?? "México"} · {grupo.lines.length}{" "}
                  {grupo.lines.length === 1 ? "carta" : "cartas"}
                </span>
              </h2>

              <ul className="mt-3 grid gap-2.5">
                {grupo.lines.map((l) => {
                  const otras = (alternativas.get(l.cardId ?? -1) ?? []).filter(
                    (s) => s.listingId !== l.listingId,
                  );
                  const agotada = l.stockActual != null && l.stockActual < l.qty;
                  return (
                    <li
                      key={l.id}
                      className="rounded-card border border-line bg-surface px-4 py-3.5 shadow-card"
                    >
                      <div className="flex flex-wrap items-center gap-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {l.imageUrl ? (
                          <img
                            src={l.imageUrl}
                            alt=""
                            width={40}
                            height={56}
                            className="h-14 w-10 shrink-0 rounded-[4px] object-cover"
                          />
                        ) : (
                          <span className="h-14 w-10 shrink-0 rounded-[4px] bg-surface-2" />
                        )}

                        <span className="min-w-0 flex-1">
                          <Link
                            href={l.cardSlug ? `/carta/${l.cardSlug}` : "#"}
                            className="block truncate text-[15px] font-semibold text-ink hover:text-accent"
                          >
                            {l.cardName}
                          </Link>
                          <span className="block text-[13px] text-muted">
                            {detalle(l)}
                            {detalle(l) && " · "}
                            <span className="font-semibold text-ink">
                              {conditionLabel(l.condition)}
                            </span>
                            {/* El comprador tiene derecho a saber de quién compra:
                                el stock del afiliado suma al de la tienda, pero la
                                carta es de él. */}
                            {l.sellerType === "affiliate" && (
                              <span className="text-accent"> · afiliado {l.sellerName}</span>
                            )}
                          </span>
                          {/* Una comanda con renglones de muestra no puede
                              presentarse como una compra real. */}
                          {l.storeDataSource === "sample" && (
                            <span
                              title="Esta tienda todavía no se ingiere en vivo: precio y stock son sintéticos"
                              className="mt-1 inline-block rounded-pill border border-warn-line bg-warn-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn"
                            >
                              demo
                            </span>
                          )}
                          {agotada && (
                            <span className="mt-0.5 block text-[12px] font-semibold text-warn">
                              {l.stockActual === 0
                                ? "Ya no está disponible en esta tienda"
                                : `Sólo quedan ${l.stockActual}`}
                            </span>
                          )}
                        </span>

                        <form action={cambiarCantidad} className="flex items-center gap-1.5">
                          <input type="hidden" name="lineId" value={l.id} />
                          <input
                            type="number"
                            name="qty"
                            min={1}
                            defaultValue={l.qty}
                            aria-label={`Cantidad de ${l.cardName}`}
                            className="w-16 rounded-control border border-line bg-surface px-2 py-1.5 text-center text-[14px] tnum outline-none focus:border-accent"
                          />
                          <button
                            type="submit"
                            className="rounded-pill border border-line px-3 py-1.5 text-[13px] font-semibold text-muted transition hover:border-accent hover:text-accent"
                          >
                            Cambiar
                          </button>
                        </form>

                        <span className="w-24 whitespace-nowrap text-right">
                          <span className="block text-[15px] font-bold tnum">
                            {money(l.unitPriceCents * l.qty)}
                          </span>
                          {l.qty > 1 && (
                            <span className="block text-[12px] text-muted tnum">
                              {money(l.unitPriceCents)} c/u
                            </span>
                          )}
                        </span>

                        <form action={quitarRenglon}>
                          <input type="hidden" name="lineId" value={l.id} />
                          <button
                            type="submit"
                            aria-label={`Quitar ${l.cardName}`}
                            className="rounded-pill border border-line px-3 py-1.5 text-[13px] font-semibold text-muted transition hover:border-warn hover:text-warn"
                          >
                            Quitar
                          </button>
                        </form>
                      </div>

                      {otras.length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[13px] font-semibold text-accent">
                            Cambiar de fuente ({otras.length}{" "}
                            {otras.length === 1 ? "otra tienda" : "otras tiendas"})
                          </summary>
                          <ul className="mt-2 grid gap-1.5 border-t border-line-soft pt-2">
                            {otras.map((s) => (
                              <li key={s.listingId} className="flex items-center gap-3 text-[13px]">
                                <span className="min-w-0 flex-1 truncate">
                                  {s.storeName}
                                  <span className="text-muted">
                                    {" · "}
                                    {conditionLabel(s.condition)}
                                    {s.sellerType === "affiliate" && ` · afiliado ${s.sellerName}`}
                                  </span>
                                </span>
                                <span className="tnum font-semibold">{money(s.priceCents)}</span>
                                <form action={cambiarFuente}>
                                  <input type="hidden" name="lineId" value={l.id} />
                                  <input type="hidden" name="listingId" value={s.listingId} />
                                  <button
                                    type="submit"
                                    className="rounded-pill border border-line px-3 py-1 font-semibold text-muted transition hover:border-accent hover:text-accent"
                                  >
                                    Usar ésta
                                  </button>
                                </form>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-[12px] leading-relaxed text-muted">
                            Cambiar de fuente puede sumar una tienda al pedido, y con
                            ella su recolección.
                          </p>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <section className="mt-10">
            <h2 className="text-xl font-bold">Cómo la quieres recibir</h2>
            <form action={elegirEntrega} className="mt-3 grid gap-2">
              {ENTREGAS.map((e) => {
                const c = costoEntrega(e, comanda!.ciudadesOrigen);
                const costo = c.consolidationCents + c.shippingCents;
                return (
                  <label
                    key={e}
                    className="flex cursor-pointer items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-[15px] shadow-card transition hover:border-accent"
                  >
                    <input
                      type="radio"
                      name="entrega"
                      value={e}
                      defaultChecked={comanda!.delivery === e}
                      className="accent-accent"
                    />
                    <span className="flex-1">{ETIQUETA_ENTREGA[e]}</span>
                    <span className="tnum font-semibold">
                      {costo === 0 ? "gratis" : money(costo)}
                    </span>
                  </label>
                );
              })}
              <div className="mt-1">
                <button
                  type="submit"
                  className="rounded-pill border border-line bg-surface px-5 py-2 text-[14px] font-semibold text-muted shadow-card transition hover:border-accent hover:text-accent"
                >
                  Guardar entrega
                </button>
              </div>
            </form>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Consolidar es que un mensajero junte tus cartas de varias tiendas en
              una sola. La corrida va en días fijos y sirve a varias comandas a la
              vez: por eso cuesta {money(5_000)} y no lo que costaría un viaje
              dedicado.
            </p>
          </section>

          {d && (
            <section className="mt-10 rounded-card border border-line bg-surface p-5 shadow-card">
              <dl className="grid gap-1.5 text-[15px]">
                <div className="flex justify-between">
                  <dt className="text-muted">Cartas</dt>
                  <dd className="tnum font-semibold">{money(d.subtotalCents)}</dd>
                </div>
                {d.consolidationCents > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted">Consolidación</dt>
                    <dd className="tnum font-semibold">{money(d.consolidationCents)}</dd>
                  </div>
                )}
                {d.shippingCents > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted">
                      Envío
                      {comanda!.ciudadesOrigen > 1 && ` · ${comanda!.ciudadesOrigen} ciudades`}
                    </dt>
                    <dd className="tnum font-semibold">{money(d.shippingCents)}</dd>
                  </div>
                )}
                <div className="mt-1.5 flex justify-between border-t border-line pt-2.5 text-[19px]">
                  <dt className="font-bold">Total</dt>
                  <dd className="tnum font-bold">{money(d.totalCents)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                El precio de las cartas es el de cada tienda: no le sumamos nada
                encima. Al pagar revisamos carta por carta y, si alguien se te
                adelantó, te enseñamos el cambio antes de cobrar.
              </p>
              <p className="mt-4 text-[13px] font-semibold text-muted">
                El pago llega en el siguiente paso.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
