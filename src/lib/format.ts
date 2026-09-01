import type { Condition, Finish } from "@/lib/types";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return MXN.format(cents / 100);
}

export const CONDITION_LABELS: Record<Condition, string> = {
  NM: "Near Mint",
  LP: "Poco jugada",
  MP: "Jugada",
  HP: "Muy jugada",
  DMG: "Dañada",
  SEALED: "Sellado",
  UNKNOWN: "Sin especificar",
};

export const CONDITION_ORDER: Condition[] = ["NM", "LP", "MP", "HP", "DMG", "UNKNOWN"];

export function conditionLabel(c: string): string {
  return CONDITION_LABELS[c as Condition] ?? c;
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: "Inglés",
  es: "Español",
  ja: "Japonés",
  pt: "Portugués",
  fr: "Francés",
  de: "Alemán",
  it: "Italiano",
  zh: "Chino",
  ko: "Coreano",
};

export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

export function finishLabel(f: Finish | string): string {
  if (f === "foil") return "Foil";
  if (f === "etched") return "Etched foil";
  return "No foil";
}

/** "hace 2 horas", "hace 3 días" — para saber qué tan fresco está el dato. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "nunca";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}
