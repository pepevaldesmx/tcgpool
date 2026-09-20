/**
 * Lector de CSV.
 *
 * Escrito a mano y no con `split(",")` porque los nombres de carta traen comas
 * y comillas de verdad: "Erase (Not the Urza's Legacy One)", "Jaya, Fiery
 * Negotiator". Partir por comas convierte esos renglones en basura silenciosa,
 * que es peor que fallar.
 *
 * Sigue RFC 4180: campos entre comillas, comillas dobles escapadas como "", y
 * saltos de línea dentro de un campo entrecomillado.
 */
export function parseCsv(text: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;
  let i = 0;

  // El BOM de Excel se cuela en la primera columna y rompe la detección de
  // encabezados: "﻿nombre" no es "nombre".
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  const cerrarCampo = () => {
    fila.push(campo);
    campo = "";
  };
  const cerrarFila = () => {
    cerrarCampo();
    // Una fila vacía al final (el salto de línea del archivo) no es un renglón.
    if (fila.length > 1 || fila[0] !== "") filas.push(fila);
    fila = [];
  };

  while (i < text.length) {
    const c = text[i];

    if (enComillas) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        enComillas = false;
        i++;
        continue;
      }
      campo += c;
      i++;
      continue;
    }

    if (c === '"' && campo === "") {
      enComillas = true;
      i++;
      continue;
    }
    if (c === "," || c === ";" || c === "\t") {
      cerrarCampo();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      cerrarFila();
      i++;
      continue;
    }
    campo += c;
    i++;
  }
  if (campo !== "" || fila.length) cerrarFila();
  return filas;
}

/** Los campos que sabemos leer de un inventario. */
export type Campo =
  | "nombre"
  | "set"
  | "numero"
  | "condicion"
  | "idioma"
  | "acabado"
  | "precio"
  | "cantidad";

/**
 * Cómo nombra cada tienda sus columnas. Se compara normalizado, así que
 * "Precio (MXN)" empata con "precio".
 */
const ENCABEZADOS: Array<[Campo, RegExp]> = [
  ["nombre", /^(nombre|name|carta|card|card ?name|producto|title|titulo)\b/],
  ["set", /^(set|edicion|edition|expansion|coleccion|set ?name)\b/],
  ["numero", /^(numero|num|no|collector ?number|card ?number|cn)\b/],
  ["condicion", /^(condicion|condition|estado|grade|cond)\b/],
  ["idioma", /^(idioma|language|lang|lenguaje)\b/],
  ["acabado", /^(acabado|finish|foil|treatment|tratamiento)\b/],
  ["precio", /^(precio|price|precio ?mxn|costo|valor|price ?mxn)\b/],
  ["cantidad", /^(cantidad|qty|quantity|stock|existencia|inventario|count)\b/],
];

function normalizarEncabezado(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Devuelve, por cada campo que reconocimos, en qué columna está. */
export function detectColumns(header: string[]): Partial<Record<Campo, number>> {
  const out: Partial<Record<Campo, number>> = {};
  header.forEach((raw, i) => {
    const h = normalizarEncabezado(raw);
    if (!h) return;
    for (const [campo, re] of ENCABEZADOS) {
      // La primera columna que empata se queda: si el archivo trae "precio" y
      // "precio con descuento", manda la de la izquierda.
      if (out[campo] === undefined && re.test(h)) {
        out[campo] = i;
        return;
      }
    }
  });
  return out;
}

/** "1,234.50", "$99", "45,00" -> número. Devuelve null si no es un precio. */
export function parsePrice(raw: string): number | null {
  const limpio = raw.replace(/[^\d.,-]/g, "").trim();
  if (!limpio) return null;
  // Si hay coma Y punto, el último separador es el decimal. Si sólo hay coma,
  // se decide por la posición: "45,00" son centavos; "1,234" son miles.
  let normalizado = limpio;
  const coma = limpio.lastIndexOf(",");
  const punto = limpio.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    normalizado = coma > punto ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(/,/g, "");
  } else if (coma >= 0) {
    normalizado = /,\d{1,2}$/.test(limpio) ? limpio.replace(",", ".") : limpio.replace(/,/g, "");
  }
  const n = Number(normalizado);
  return Number.isFinite(n) && n > 0 ? n : null;
}
