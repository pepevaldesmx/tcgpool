"use client";

import { useState } from "react";
import type { StorePublic } from "@/lib/db/queries";

/** Distancia en km entre dos coordenadas (haversine). */
function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Status = "idle" | "asking" | "ok" | "denied" | "unsupported";

/**
 * Tiendas ordenadas por inventario (lo que manda el servidor) o por cercanía si
 * el usuario comparte su ubicación. No la pedimos sola al cargar: el permiso se
 * pide cuando la persona lo elige.
 */
export default function StoreList({ stores }: { stores: StorePublic[] }) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  function askLocation() {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    setStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("ok");
      },
      () => setStatus("denied"),
      { timeout: 8000, maximumAge: 600000 },
    );
  }

  const withDistance = stores.map((store) => ({
    store,
    km:
      coords && store.lat != null && store.lng != null
        ? distanceKm(coords, { lat: store.lat, lng: store.lng })
        : null,
  }));

  const sorted = coords
    ? [...withDistance].sort(
        (a, b) => (a.km ?? Number.MAX_VALUE) - (b.km ?? Number.MAX_VALUE),
      )
    : withDistance;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted">
          {coords
            ? "Ordenadas por cercanía a tu ubicación."
            : "Ordenadas por inventario disponible (tienda + afiliados)."}
        </p>
        {!coords && (
          <button
            type="button"
            onClick={askLocation}
            disabled={status === "asking"}
            className="rounded-sm border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {status === "asking" ? "Buscando…" : "Ordenar por cercanía"}
          </button>
        )}
      </div>

      {(status === "denied" || status === "unsupported") && (
        <p className="mt-2 text-xs text-muted">
          {status === "denied"
            ? "No nos diste ubicación; seguimos ordenando por inventario."
            : "Tu navegador no comparte ubicación; seguimos ordenando por inventario."}
        </p>
      )}

      <ul className="mt-4 divide-y divide-line-soft overflow-hidden rounded border border-line bg-surface">
        {sorted.map(({ store, km }) => (
          <li key={store.id}>
            <a
              href={store.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 px-4 py-3 transition hover:bg-hover"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-[15px] font-semibold">
                  {store.name}
                </span>
                <span className="block text-xs text-muted">
                  {store.city ?? "México"}
                  {km != null && ` · a ${km < 1 ? "menos de 1" : Math.round(km)} km`}
                  {store.affiliateCount > 0 &&
                    ` · ${store.affiliateCount} afiliados`}
                </span>
              </span>
              <span className="whitespace-nowrap text-right">
                <span className="block font-mono text-[15px] font-bold tnum">
                  {store.inStockCount.toLocaleString("es-MX")}
                </span>
                <span className="block text-[11px] text-muted">cartas con stock</span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      {coords && (
        <p className="mt-2 text-xs text-muted">
          La distancia es al centro de la ciudad de cada tienda, no a su dirección
          exacta.
        </p>
      )}
    </div>
  );
}
