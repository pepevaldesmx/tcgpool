import { detectColumns, parseCsv, parsePrice, type Campo } from "@/lib/csv";
import {
  detectCondition,
  detectFinish,
  detectLanguage,
  normalizeText,
  parseTitle,
} from "@/lib/ingest/normalize";
import { resolveAgainstCatalog } from "@/lib/ingest/resolve";
import type { CatalogEntry } from "@/lib/db/queries";
import type { Condition, Finish } from "@/lib/types";

/**
 * Convierte el inventario exportado de una tienda en renglones que podemos
 * guardar.
 *
 * Es el conector que no necesita que la tienda corra nada en particular: toda
 * tienda sabe exportar un CSV, tenga Shopify, Wix o una hoja de cálculo. Por
 * eso es el que desbloquea a las que no tienen feed.
 *
 * No toca la base ni la red: recibe el texto y el catálogo ya cargado, y
 * devuelve qué entendió y qué no. Así se puede enseñar una vista previa antes
 * de escribir nada, y probarse entero sin base de datos.
 */

export interface FilaImportable {
  cardId: number;
  cardName: string;
  setName: string | null;
  collectorNumber: string | null;
  language: string;
  finish: Finish;
  condition: Condition;
  priceCents: number;
  stock: number;
}

export interface ResultadoLectura {
  filas: FilaImportable[];
  /** Nombres que el catálogo no reconoció, con cuántas veces aparecen. */
  desconocidos: Array<{ nombre: string; veces: number }>;
  /** Renglones descartados por algo que no es el nombre (precio ilegible). */
  descartados: number;
  columnas: Partial<Record<Campo, number>>;
  total: number;
  error?: string;
}

/** Tope por archivo: más que esto no termina dentro de una petición web. */
export const MAX_FILAS = 3000;

export function leerInventarioCsv(
  texto: string,
  catalogo: Map<string, CatalogEntry>,
): ResultadoLectura {
  const base: ResultadoLectura = {
    filas: [],
    desconocidos: [],
    descartados: 0,
    columnas: {},
    total: 0,
  };

  const filas = parseCsv(texto);
  if (filas.length < 2) {
    return { ...base, error: "El archivo no trae renglones debajo del encabezado." };
  }

  const columnas = detectColumns(filas[0]);
  if (columnas.nombre === undefined) {
    return {
      ...base,
      columnas,
      error:
        "No encontramos la columna del nombre de la carta. Ponle 'nombre' o 'card name' al encabezado.",
    };
  }
  if (columnas.precio === undefined) {
    return {
      ...base,
      columnas,
      error: "No encontramos la columna del precio. Ponle 'precio' o 'price' al encabezado.",
    };
  }

  const cuerpo = filas.slice(1, MAX_FILAS + 1);
  const campo = (fila: string[], c: Campo) => {
    const i = columnas[c];
    return i === undefined ? "" : (fila[i] ?? "").trim();
  };

  const desconocidos = new Map<string, number>();
  const salida: FilaImportable[] = [];
  let descartados = 0;

  for (const fila of cuerpo) {
    const nombre = campo(fila, "nombre");
    if (!nombre) continue;

    // El mismo parser que la ingesta de Shopify: una tienda que exporta su
    // inventario suele traer "Sol Ring [Commander 2021] Foil" en una sola
    // columna, y de ahí salen también el set y el número cuando no hay columna.
    const parsed = parseTitle(nombre);
    const entry =
      catalogo.get(normalizeText(parsed.cardName)) ??
      (() => {
        const recortado = resolveAgainstCatalog(parsed.cardName, (k) => catalogo.has(k));
        return recortado ? catalogo.get(normalizeText(recortado)) : undefined;
      })();

    if (!entry) {
      desconocidos.set(nombre, (desconocidos.get(nombre) ?? 0) + 1);
      continue;
    }

    const precio = parsePrice(campo(fila, "precio"));
    if (precio == null) {
      descartados++;
      continue;
    }

    // La cantidad es opcional: una tienda que exporta sólo lo que tiene no la
    // pone, y suponer cero dejaría todo el archivo marcado como agotado.
    const cantidadCruda = campo(fila, "cantidad");
    const cantidad = cantidadCruda ? Number.parseInt(cantidadCruda, 10) : 1;

    // El acabado y el idioma pueden venir en su columna o colgando del nombre.
    const acabadoTexto = [campo(fila, "acabado"), nombre].join(" ");
    const idiomaTexto = [campo(fila, "idioma"), nombre].join(" ");

    salida.push({
      cardId: entry.id,
      cardName: entry.name,
      setName: campo(fila, "set") || parsed.setName || null,
      collectorNumber: campo(fila, "numero") || parsed.collectorNumber || null,
      language: detectLanguage(idiomaTexto),
      finish: detectFinish(acabadoTexto),
      condition: detectCondition(campo(fila, "condicion")),
      priceCents: Math.round(precio * 100),
      stock: Number.isFinite(cantidad) && cantidad >= 0 ? cantidad : 1,
    });
  }

  return {
    filas: salida,
    desconocidos: [...desconocidos]
      .map(([nombre, veces]) => ({ nombre, veces }))
      .sort((a, b) => b.veces - a.veces),
    descartados,
    columnas,
    total: filas.length - 1,
  };
}
