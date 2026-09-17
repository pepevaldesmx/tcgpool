/**
 * Tipo de cambio dólar → peso.
 *
 * El precio de referencia viene en dólares (TCGplayer vía Scryfall) y la tienda
 * vende en pesos, así que hay una multiplicación de por medio. Ese número tiene
 * que ser el de HOY: un tipo de cambio quemado en el código envejece sin avisar
 * y empieza a sugerir precios mal en silencio.
 *
 * Lo que NO hace: adivinar. Si la fuente no responde, se usa el respaldo
 * configurado y la UI lo DICE, en vez de pasar un número viejo por vigente.
 */

export type FxSource = "vivo" | "configurado" | "respaldo";

export interface Fx {
  rate: number;
  source: FxSource;
  /** Fecha del tipo de cambio, no de la consulta. */
  asOf: string | null;
}

/** Último recurso, si no hay red ni configuración. */
const RESPALDO = 18;

/**
 * Banda de cordura. Una respuesta corrupta que devuelva 1 o 5000 convertiría
 * una carta de dos dólares en dos pesos o en diez mil, y la tienda publicaría
 * eso. Fuera de esta banda preferimos el respaldo y decirlo.
 */
const MIN = 8;
const MAX = 60;

let cache: { at: number; fx: Fx } | null = null;
const TTL_MS = 6 * 60 * 60 * 1000;

function configurado(): Fx | null {
  const raw = Number(process.env.MXN_POR_USD);
  if (!Number.isFinite(raw) || raw < MIN || raw > MAX) return null;
  return { rate: raw, source: "configurado", asOf: null };
}

export async function usdToMxn(): Promise<Fx> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.fx;

  let fx: Fx | null = null;
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=MXN", {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const body = (await res.json()) as { date?: string; rates?: { MXN?: number } };
      const rate = body.rates?.MXN;
      if (typeof rate === "number" && rate >= MIN && rate <= MAX) {
        fx = { rate: Math.round(rate * 100) / 100, source: "vivo", asOf: body.date ?? null };
      }
    }
  } catch {
    // Sin red: el respaldo se encarga, y la UI dirá que no es de hoy.
  }

  fx ??= configurado() ?? { rate: RESPALDO, source: "respaldo", asOf: null };
  cache = { at: Date.now(), fx };
  return fx;
}
