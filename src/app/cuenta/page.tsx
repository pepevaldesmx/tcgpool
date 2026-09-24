import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth/session";
import { guardarPerfil } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi cuenta",
  robots: { index: false, follow: false },
};

const ROLES: Record<string, string> = {
  owner: "Dueño",
  operator: "Captura inventario",
};

export default async function CuentaPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/entrar?next=%2Fcuenta");

  const { user, memberships } = sesion;
  const tiendas = memberships.filter((m) => m.sellerType === "store");
  const afiliaciones = memberships.filter((m) => m.sellerType === "affiliate");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="text-[11px] uppercase tracking-[0.09em] text-muted">Mi cuenta</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{user.name ?? user.email}</h1>
      <p className="mt-1 text-[14px] text-muted">{user.email}</p>

      <section className="mt-8">
        <h2 className="text-xl font-bold">Tus datos</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-muted">
          El nombre y el teléfono son para que la tienda sepa a quién le entrega.
          No se muestran en el buscador.
        </p>
        <form action={guardarPerfil} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-[13px] font-semibold text-ink">
              Nombre
            </label>
            <input
              id="name"
              name="name"
              defaultValue={user.name ?? ""}
              autoComplete="name"
              className="mt-1.5 w-full rounded-control border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none transition focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-[13px] font-semibold text-ink">
              Teléfono
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={user.phone ?? ""}
              autoComplete="tel"
              placeholder="55 1234 5678"
              className="mt-1.5 w-full rounded-control border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none transition focus:border-accent"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-pill bg-accent px-5 py-2.5 text-[15px] font-semibold text-accent-ink shadow-card transition hover:shadow-lift"
            >
              Guardar
            </button>
          </div>
        </form>
      </section>

      {tiendas.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">Tus tiendas</h2>
          <ul className="mt-4 grid gap-3">
            {tiendas.map((m) => (
              <li
                key={m.sellerId}
                className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 shadow-card"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-ink">{m.storeName ?? m.sellerName}</p>
                  <p className="text-[13px] text-muted">{ROLES[m.role] ?? m.role}</p>
                </div>
                {m.storeSlug && (
                  <Link
                    href={`/tienda/${m.storeSlug}`}
                    className="ml-auto rounded-pill border border-line bg-surface px-4 py-1.5 text-[14px] font-semibold text-muted transition hover:border-accent hover:text-accent"
                  >
                    Abrir panel
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {afiliaciones.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">Tus afiliaciones</h2>
          <p className="mt-1 text-[14px] leading-relaxed text-muted">
            Tu inventario se suma al de la tienda que te avala. Ella no cobra
            comisión de lo que vendas.
          </p>
          <ul className="mt-4 grid gap-3">
            {afiliaciones.map((m) => (
              <li
                key={m.sellerId}
                className="rounded-card border border-line bg-surface px-4 py-3.5 shadow-card"
              >
                <p className="text-[15px] font-semibold text-ink">{m.sellerName}</p>
                <p className="text-[13px] text-muted">{ROLES[m.role] ?? m.role}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {user.isAdmin && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">Administración</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            Las tiendas todavía se dan de alta en{" "}
            <code className="font-mono text-ink">data/stores.json</code>. El alta
            desde aquí llega con el panel de admin.
          </p>
        </section>
      )}

      <form action="/salir" method="post" className="mt-12 border-t border-line pt-6">
        <button
          type="submit"
          className="rounded-pill border border-line bg-surface px-5 py-2 text-[14px] font-semibold text-muted transition hover:border-warn hover:text-warn"
        >
          Salir
        </button>
      </form>
    </div>
  );
}
