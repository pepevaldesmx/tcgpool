import type { Provenance } from "@/lib/db/queries";

/**
 * Advertencia de datos sintéticos, dicha con números.
 *
 * No es un booleano: con parte del catálogo ya real, decir "datos de
 * demostración" a secas sería tan falso como no decir nada. Si ninguna tienda
 * sigue en muestra, este componente no pinta nada.
 */
export default function SampleDataNotice({ provenance }: { provenance: Provenance }) {
  const { live, sample, sampleNames } = provenance;
  if (sample === 0) return null;

  return (
    <div className="rounded-card border border-warn-line bg-warn-bg px-5 py-4 text-[13px] leading-relaxed text-warn">
      {live > 0 ? (
        <>
          <strong className="font-semibold">
            {live} de {live + sample} tiendas con catálogo real.
          </strong>{" "}
          {sampleNames.join(", ")} {sample === 1 ? "todavía muestra" : "todavía muestran"}{" "}
          precios y stock sintéticos, marcados como <em>demo</em> en cada listado.
        </>
      ) : (
        <>
          <strong className="font-semibold">Datos de demostración.</strong> Las cartas,
          sets e imágenes son reales (Scryfall), pero los precios, condiciones y stock
          son sintéticos: todavía no se ha ingerido el feed real de las tiendas. Corre{" "}
          <code className="rounded bg-surface/70 px-1 py-0.5 font-mono">
            npm run sync -- --live
          </code>{" "}
          para sustituirlos por catálogo real.
        </>
      )}
    </div>
  );
}
