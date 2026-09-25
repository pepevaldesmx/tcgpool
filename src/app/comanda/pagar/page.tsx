import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth/session";
import { conditionLabel, money } from "@/lib/format";
import { ETIQUETA_ENTREGA } from "@/lib/comanda/money";
import { ETIQUETA_CAMBIO, huellaRevision, type Cambio } from "@/lib/comanda/revalidar";
import { isStripeConfigured } from "@/lib/pagos/config";
import { revisarComandaAbierta } from "./revision";
import { aceptarYPagar } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pagar",
  robots: { index: false, follow: false },
};

const TONO: Record<Cambio, string> = {
  igual: "text-muted",
  precio: "text-warn",
  menos: "text-warn",
  movida: "text-warn",
  perdida: "text-warn",
};

export default async function PagarPage({
  searchParams,
}: {
  searchParams: Promise<{ semovio?: string; falta?: string }>;
}) {
  const sesion = await getSesion();
  if (!sesion) redirect("/entrar?next=%2Fcomanda%2Fpagar");

  const { semovio, falta } = await searchParams;
  const completa = await revisarComandaAbierta(sesion.user.id);
  if (!completa) redirect("/comanda");

  const { comanda, revision, desglose } = completa;
  if (!comanda.cobrable) redirect("/comanda");

  const cambiados = revision.renglones.filter((r) => r.cambio !== "igual");
  const cobrables = revision.renglones.filter((r) => r.qtyAhora > 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="text-[11px] uppercase tracking-[0.09em] text-muted">Antes de cobrar</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Revisamos tu comanda</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        No apartamos inventario —bloquear el stock de una tienda por una compra que
        quizá no se concrete le quitaría ventas reales— así que revisamos carta por
        carta justo antes de cobrar.
      </p>

      {falta === "stripe" && (
        <p className="mt-6 rounded-card border border-warn-line bg-warn-bg px-4 py-3 text-[14px] leading-relaxed text-warn">
          <strong className="font-semibold">Todavía no podemos cobrar.</strong> Falta
          conectar el cobro con tarjeta. Tu comanda ya quedó actualizada con lo que
          encontramos.
        </p>
      )}

      {semovio === "1" && (
        <p className="mt-6 rounded-card border border-warn-line bg-warn-bg px-4 py-3 text-[14px] leading-relaxed text-warn">
          <strong className="font-semibold">Algo cambió mientras leías.</strong> No
          cobramos nada. Esto es lo que hay ahora.
        </p>
      )}

      {cambiados.length === 0 ? (
        <p className="mt-6 rounded-card border border-ok-line bg-ok-bg px-4 py-3 text-[14px] text-ok">
          Todo sigue disponible al mismo precio.
        </p>
      ) : (
        <p className="mt-6 rounded-card border border-warn-line bg-warn-bg px-4 py-3 text-[14px] leading-relaxed text-warn">
          <strong className="font-semibold">
            {cambiados.length === 1 ? "Un renglón cambió" : `${cambiados.length} renglones cambiaron`}
          </strong>{" "}
          desde que armaste la comanda. Nada se cobra hasta que lo apruebes.
          {revision.perdidas.length > 0 && (
            <>
              {" "}
              Lo que nadie tiene no se cobra y lo guardamos en tu wishlist para
              avisarte cuando aparezca.
            </>
          )}
        </p>
      )}

      <ul className="mt-6 grid gap-2.5">
        {revision.renglones.map((r) => {
          const linea = comanda.lines.find((l) => l.id === r.lineId);
          return (
            <li
              key={r.lineId}
              className={`rounded-card border bg-surface px-4 py-3.5 shadow-card ${
                r.cambio === "igual" ? "border-line" : "border-warn-line"
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[15px] font-semibold ${
                      r.cambio === "perdida" ? "text-muted line-through" : "text-ink"
                    }`}
                  >
                    {r.qtyAhora > 1 && `${r.qtyAhora}× `}
                    {r.cardName}
                  </span>
                  <span className="block text-[13px] text-muted">
                    {linea && conditionLabel(linea.condition)}
                    {r.tiendaAhora && ` · ${r.fuente?.storeName ?? linea?.storeName ?? r.tiendaAhora}`}
                  </span>
                </span>
                <span className="whitespace-nowrap text-right">
                  <span className="block text-[15px] font-bold tnum">
                    {money(r.precioAhora * r.qtyAhora)}
                  </span>
                  {r.precioAntes * r.qtyAntes !== r.precioAhora * r.qtyAhora && (
                    <span className="block text-[12px] text-muted line-through tnum">
                      {money(r.precioAntes * r.qtyAntes)}
                    </span>
                  )}
                </span>
              </div>

              {r.cambio !== "igual" && (
                <p className={`mt-1.5 text-[13px] font-semibold ${TONO[r.cambio]}`}>
                  {ETIQUETA_CAMBIO[r.cambio]}
                  {r.cambio === "movida" && (
                    <span className="font-normal">
                      {" "}
                      — antes en {linea?.storeName ?? r.tiendaAntes}
                    </span>
                  )}
                  {r.cambio === "menos" && (
                    <span className="font-normal">
                      {" "}
                      — pediste {r.qtyAntes}, quedan {r.qtyAhora}
                    </span>
                  )}
                  {r.cambio === "precio" && (
                    <span className="font-normal">
                      {" "}
                      — {money(r.precioAntes)} → {money(r.precioAhora)} por copia
                    </span>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <section className="mt-8 rounded-card border border-line bg-surface p-5 shadow-card">
        <dl className="grid gap-1.5 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-muted">
              Cartas · {cobrables.length} {cobrables.length === 1 ? "renglón" : "renglones"}
            </dt>
            <dd className="tnum font-semibold">{money(desglose.subtotalCents)}</dd>
          </div>
          {desglose.consolidationCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Consolidación</dt>
              <dd className="tnum font-semibold">{money(desglose.consolidationCents)}</dd>
            </div>
          )}
          {desglose.shippingCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">
                Envío
                {completa.ciudadesOrigen > 1 && ` · ${completa.ciudadesOrigen} ciudades`}
              </dt>
              <dd className="tnum font-semibold">{money(desglose.shippingCents)}</dd>
            </div>
          )}
          <div className="mt-1.5 flex justify-between border-t border-line pt-2.5 text-[19px]">
            <dt className="font-bold">Total</dt>
            <dd className="tnum font-bold">{money(desglose.totalCents)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[13px] text-muted">
          {ETIQUETA_ENTREGA[comanda.delivery]}.{" "}
          <Link href="/comanda" className="font-semibold text-accent underline">
            Cambiar
          </Link>
        </p>
      </section>

      {cobrables.length === 0 ? (
        <p className="mt-6 rounded-card border border-warn-line bg-warn-bg px-4 py-3 text-[14px] leading-relaxed text-warn">
          No quedó nada que cobrar: se acabaron todas. Las guardamos en tu wishlist
          cuando aceptes.
        </p>
      ) : null}

      <form action={aceptarYPagar} className="mt-8">
        {/* La huella es la forma de lo que se está enseñando. Si al aceptar ya no
            coincide, se vuelve a enseñar y no se cobra. */}
        <input type="hidden" name="huella" value={huellaRevision(revision)} />
        <button
          type="submit"
          className="w-full rounded-pill bg-accent px-6 py-3 text-[16px] font-semibold text-accent-ink shadow-card transition hover:shadow-lift"
        >
          {cambiados.length === 0
            ? `Pagar ${money(desglose.totalCents)}`
            : `Acepto los cambios y pago ${money(desglose.totalCents)}`}
        </button>
        {!isStripeConfigured() && (
          <p className="mt-2 text-center text-[13px] text-muted">
            El cobro con tarjeta todavía no está conectado.
          </p>
        )}
      </form>

      <p className="mt-4 text-center text-[13px] text-muted">
        <Link href="/comanda" className="underline">
          Volver a mi comanda
        </Link>
      </p>
    </div>
  );
}
