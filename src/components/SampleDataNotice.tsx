export default function SampleDataNotice() {
  return (
    <div className="rounded-xl border border-accent-500/30 bg-accent-500/10 px-4 py-3 text-xs leading-relaxed text-accent-400">
      <strong className="font-semibold">Datos de demostración.</strong> Las cartas,
      sets e imágenes son reales (Scryfall), pero los precios, condiciones y stock
      son sintéticos: todavía no se ha ingerido el feed real de las tiendas. Corre{" "}
      <code className="rounded bg-ink-950/60 px-1 py-0.5">npm run sync -- --live</code>{" "}
      para sustituirlos por catálogo real.
    </div>
  );
}
