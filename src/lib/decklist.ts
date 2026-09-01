/**
 * Parser de decklists. Acepta lo que la gente realmente pega: exportaciones de
 * Moxfield/Archidekt, listas escritas a mano, con o sin cantidad, con o sin
 * set entre paréntesis.
 *
 *   4 Lightning Bolt
 *   4x Lightning Bolt
 *   1 Sol Ring (MSC) 211
 *   Sol Ring
 *   // Sideboard        -> se ignora
 */

export interface DeckLine {
  /** La línea tal cual la pegó el usuario. */
  raw: string;
  qty: number;
  name: string;
}

const IGNORED = /^(\/\/|#|sideboard\b|mainboard\b|deck\b|commander\b|maybeboard\b)/i;

export function parseDecklist(text: string, maxLines = 300): DeckLine[] {
  const lines: DeckLine[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw || IGNORED.test(raw)) continue;

    // "SB: 2 Card" (formato viejo de MTGO)
    const body = raw.replace(/^sb:\s*/i, "");

    const match = body.match(/^(\d{1,3})\s*[xX]?\s+(.+)$/);
    const qty = match ? Math.min(Number.parseInt(match[1], 10), 99) : 1;
    let name = (match ? match[2] : body).trim();

    // Cola de set/número: "(MSC) 211", "[MSC]", "#211"
    name = name
      .replace(/\s*[\(\[][A-Za-z0-9]{2,6}[\)\]].*$/, "")
      .replace(/\s*#\s*\d+\s*$/, "")
      .replace(/\s*\*[^*]*\*\s*$/, "") // "*F*" de foil en algunas exportaciones
      .trim();

    if (!name) continue;
    lines.push({ raw, qty, name });
    if (lines.length >= maxLines) break;
  }

  return lines;
}
