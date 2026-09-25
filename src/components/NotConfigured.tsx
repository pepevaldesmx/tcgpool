import { MARCA } from "@/lib/brand";
/**
 * Estado para cuando no hay base de datos configurada.
 *
 * Existe para que la ausencia de `DATABASE_URL` sea un mensaje honesto y no
 * quinientos errores 500: el catálogo vive en Postgres desde que las tiendas
 * administran su inventario, así que sin base no hay nada que mostrar — pero
 * eso se dice, no se revienta.
 */
export default function NotConfigured() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-24">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        {MARCA}
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">
        Falta conectar la base de datos
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        El catálogo vive en Postgres. Para levantar este entorno hacen falta dos
        pasos: crear la base y aplicarle el esquema.
      </p>
      <ol className="mt-5 space-y-3 text-[15px] leading-relaxed text-ink">
        <li className="rounded-card border border-line bg-surface px-5 py-4 shadow-card">
          <span className="font-semibold">1.</span> Crea la base (Vercel → Storage →
          Postgres, o Neon) y conéctala al proyecto. La integración expone{" "}
          <code className="font-mono text-[13px]">DATABASE_URL</code>.
        </li>
        <li className="rounded-card border border-line bg-surface px-5 py-4 shadow-card">
          <span className="font-semibold">2.</span> Aplica el esquema y carga el
          catálogo:
          <pre className="mt-2 overflow-x-auto rounded-control bg-surface-2 px-3.5 py-3 font-mono text-[13px]">
            npm run db:migrate{"\n"}npm run sync -- --live
          </pre>
        </li>
      </ol>
    </div>
  );
}
