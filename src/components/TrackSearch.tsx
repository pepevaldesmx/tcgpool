"use client";

import { useEffect, useRef } from "react";

/**
 * Registra que alguien buscó, acreditándoselo a la carta que encabezó los
 * resultados.
 *
 * "Las más buscadas" tiene que medir búsquedas: contar sólo las cartas que se
 * abren deja fuera a quien busca, ve el precio en la lista y se va — que es la
 * mayoría. Se dispara una vez por consulta, no en cada render.
 */
export default function TrackSearch({ slug, query }: { slug: string; query: string }) {
  const ultima = useRef<string | null>(null);

  useEffect(() => {
    if (!slug || !query || ultima.current === query) return;
    ultima.current = query;
    fetch("/api/eventos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, kind: "search" }),
      keepalive: true,
    }).catch(() => {});
  }, [slug, query]);

  return null;
}
