"use client";

import { useEffect } from "react";

/**
 * Registra que alguien llegó a la carta. Va del lado del cliente a propósito:
 * así no contamos renders del servidor ni prefetch, y un contador nunca demora
 * la página.
 */
export default function TrackCardView({ slug }: { slug: string }) {
  useEffect(() => {
    const body = JSON.stringify({ slug, kind: "view" });
    // keepalive: si la persona navega de inmediato, la petición igual sale.
    fetch("/api/eventos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* un contador perdido no le importa a nadie */
    });
  }, [slug]);

  return null;
}
