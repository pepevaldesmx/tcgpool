export default function SampleDataNotice() {
  return (
    <div className="rounded-card border border-warn-line bg-warn-bg px-5 py-4 text-[13px] leading-relaxed text-warn">
      <strong className="font-semibold">Datos de demostración.</strong> Las cartas,
      sets e imágenes son reales (Scryfall), pero los precios, condiciones y stock
      son sintéticos: todavía no se ha ingerido el feed real de las tiendas. Corre{" "}
      <code className="rounded bg-surface/70 px-1 py-0.5 font-mono">
        npm run sync -- --live
      </code>{" "}
      para sustituirlos por catálogo real.
    </div>
  );
}
