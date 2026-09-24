import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth/session";
import { listWishlist } from "@/lib/db/wishlist";
import { money } from "@/lib/format";
import { quitarDeWishlist } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi wishlist",
  robots: { index: false, follow: false },
};

const ORIGEN: Record<string, string> = {
  busqueda: "la buscaste",
  comanda: "quedó pendiente de una comanda",
};

export default async function WishlistPage({
  searchParams,
}: {
  searchParams: Promise<{ desconocidos?: string }>;
}) {
  const sesion = await getSesion();
  if (!sesion) redirect("/entrar?next=%2Fwishlist");

  const { desconocidos } = await searchParams;
  const noReconocidos = (desconocidos ?? "").split("\n").filter(Boolean);
  const items = await listWishlist(sesion.user.id);
  const yaHay = items.filter((i) => i.storesNow > 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Mi wishlist</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        Las cartas que nadie tenía cuando las buscaste. Te avisamos por correo
        cuando alguna tienda o afiliado publique <strong>cualquier versión</strong>{" "}
        —cuando quieres una carta, la quieres como sea—. El aviso llega una vez;
        si la sigues queriendo después, vuélvela a agregar.
      </p>

      {noReconocidos.length > 0 && (
        <div className="mt-6 rounded-card border border-warn-line bg-warn-bg px-4 py-3">
          <p className="text-[14px] font-semibold text-warn">
            {noReconocidos.length === 1
              ? "Un nombre no está en el catálogo de Magic"
              : `${noReconocidos.length} nombres no están en el catálogo de Magic`}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">
            No los guardamos: preferimos decírtelo a adivinar cuál quisiste.
          </p>
          <ul className="mt-2 text-[13px] text-muted">
            {noReconocidos.map((n) => (
              <li key={n} className="font-mono">
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 ? (
        <p className="mt-8 rounded-card border border-line bg-surface px-5 py-6 text-[15px] leading-relaxed text-muted shadow-card">
          Tu wishlist está vacía. Cuando busques una carta que ninguna tienda
          tenga, aquí es donde la guardas.{" "}
          <Link href="/buscar" className="font-semibold text-accent underline">
            Buscar una carta
          </Link>
        </p>
      ) : (
        <>
          {yaHay.length > 0 && (
            <p className="mt-6 rounded-card border border-ok-line bg-ok-bg px-4 py-3 text-[14px] leading-relaxed text-ok">
              {yaHay.length === 1 ? "Una de tus cartas ya" : `${yaHay.length} de tus cartas ya`}{" "}
              {yaHay.length === 1 ? "está" : "están"} disponible
              {yaHay.length === 1 ? "" : "s"}. El correo va en camino; mientras,
              aquí {yaHay.length === 1 ? "está" : "están"}.
            </p>
          )}

          <ul className="mt-6 grid gap-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface px-4 py-3.5 shadow-card"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
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
                    href={`/carta/${item.cardSlug}`}
                    className="block truncate text-[15px] font-semibold text-ink hover:text-accent"
                  >
                    {item.cardName}
                  </Link>
                  <span className="block text-[13px] text-muted">
                    {ORIGEN[item.source] ?? item.source}
                    {item.storesNow > 0 ? (
                      <span className="font-semibold text-ok">
                        {" · "}
                        {item.storesNow}{" "}
                        {item.storesNow === 1 ? "tienda la tiene" : "tiendas la tienen"}
                        {item.minPriceCents != null && <> desde {money(item.minPriceCents)}</>}
                      </span>
                    ) : (
                      " · nadie la tiene hoy"
                    )}
                  </span>
                </span>

                <form action={quitarDeWishlist}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <button
                    type="submit"
                    className="rounded-pill border border-line bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-muted transition hover:border-warn hover:text-warn"
                  >
                    Quitar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
