const PLACEHOLDER = `4 Lightning Bolt
2 Sol Ring
1 Rhystic Study
3x Arcane Signet`;

/**
 * Caja para pegar una decklist. Es un form GET a propósito: los resultados
 * quedan en la URL, así que se pueden compartir con el compa que va a la tienda.
 *
 * El `tono` existe porque la misma caja vive en dos fondos: la página de listas,
 * que es papel, y el héroe, que es la única banda oscura de la casa. Sobre el
 * oscuro, el turquesa del sistema no alcanza contraste —se apaga en vez de
 * llamar— así que ahí manda el turquesa aclarado y la leyenda sube de tono.
 */
export default function DeckPasteBox({
  initialValue = "",
  rows = 9,
  tono = "papel",
}: {
  initialValue?: string;
  rows?: number;
  tono?: "papel" | "noche";
}) {
  const noche = tono === "noche";
  return (
    <form action="/lista" method="get" className="flex flex-col gap-2.5">
      <textarea
        name="lista"
        rows={rows}
        defaultValue={initialValue}
        placeholder={PLACEHOLDER}
        aria-label="Pega tu lista de cartas"
        className="w-full resize-y rounded-control border border-line-strong bg-surface px-4 py-3.5 font-mono text-[13px] leading-relaxed text-ink outline-none transition placeholder:text-muted/70 focus:border-accent"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className={`h-12 shrink-0 rounded-pill px-7 text-[15px] font-bold transition hover:brightness-110 ${
            noche ? "bg-accent-night text-night" : "bg-accent text-accent-ink"
          }`}
        >
          Buscar la lista
        </button>
        <span className={`text-[13px] ${noche ? "text-night-muted" : "text-muted"}`}>
          Una carta por renglón. Acepta exportaciones de Moxfield y Archidekt.
        </span>
      </div>
    </form>
  );
}
