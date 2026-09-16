"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CITIES, LOCATION_COOKIE, serializeLocation, type UserLocation } from "@/lib/location";

/**
 * Elegir ciudad o compartir ubicación. Se guarda en cookie para que el
 * SERVIDOR pueda ordenar por cercanía: el plan de surtido se calcula ahí.
 *
 * La lista de ciudades va primero y el GPS es opcional a propósito: mucha gente
 * niega el permiso, y como las coordenadas de las tiendas son el centro de su
 * ciudad, elegirla a mano da exactamente el mismo resultado sin pedir nada.
 */
export default function LocationPicker({ current }: { current: UserLocation | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  function save(loc: UserLocation | null) {
    const base = `path=/; max-age=${60 * 60 * 24 * 180}; SameSite=Lax`;
    document.cookie = loc
      ? `${LOCATION_COOKIE}=${encodeURIComponent(serializeLocation(loc))}; ${base}`
      : `${LOCATION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    router.refresh();
  }

  function useGps() {
    if (!("geolocation" in navigator)) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        save({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: "gps" });
        setBusy(false);
      },
      () => setBusy(false),
      { timeout: 8000, maximumAge: 600000 },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="text-muted">Estás en</span>
      <select
        value={current?.city ?? (current?.source === "gps" ? "__gps" : "")}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__gps") return useGps();
          const city = CITIES.find((c) => c.name === v);
          save(city ? { city: city.name, lat: city.lat, lng: city.lng, source: "city" } : null);
        }}
        aria-label="Tu ciudad"
        className="rounded-pill border border-line bg-surface px-3.5 py-1.5 font-semibold text-ink outline-none transition hover:border-accent focus:border-accent"
      >
        <option value="">Todo México</option>
        {CITIES.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
          </option>
        ))}
        <option value="__gps">{busy ? "Buscando…" : "Usar mi ubicación…"}</option>
      </select>
      {current && (
        <button
          type="button"
          onClick={() => save(null)}
          className="text-muted underline decoration-line underline-offset-2 transition hover:text-accent"
        >
          quitar
        </button>
      )}
    </div>
  );
}
