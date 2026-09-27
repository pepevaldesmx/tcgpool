"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CITIES, LOCATION_COOKIE, serializeLocation, type UserLocation } from "@/lib/location";
import { ciudadDeCodigoPostal, esCodigoPostal } from "@/lib/postal";

/**
 * Dónde está el usuario. Se guarda en cookie para que el SERVIDOR pueda ordenar
 * por cercanía: el plan de surtido se calcula ahí, no en el navegador.
 *
 * Tres caminos, del más cómodo al más seguro: código postal, ubicación del
 * navegador, o la ciudad a mano. El GPS nunca es obligatorio —mucha gente niega
 * el permiso— y como las coordenadas de las tiendas son el centro de su ciudad,
 * escribir el CP da exactamente el mismo resultado sin pedir nada.
 */
export default function LocationPicker({ current }: { current: UserLocation | null }) {
  const router = useRouter();
  const [cp, setCp] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  function guardar(loc: UserLocation | null) {
    const base = `path=/; max-age=${60 * 60 * 24 * 180}; SameSite=Lax`;
    document.cookie = loc
      ? `${LOCATION_COOKIE}=${encodeURIComponent(serializeLocation(loc))}; ${base}`
      : `${LOCATION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    router.refresh();
  }

  function usarCp() {
    setAviso(null);
    if (!esCodigoPostal(cp)) {
      setAviso("Un código postal son cinco dígitos.");
      return;
    }
    const ciudad = ciudadDeCodigoPostal(cp);
    if (!ciudad) {
      // No se adivina: mandar al comprador a ordenar por una ciudad que no es
      // la suya, y sin decírselo, es peor que no resolver nada.
      setAviso("Todavía no tenemos tiendas por ese código postal. Elige tu ciudad.");
      return;
    }
    guardar({ ...ciudad, source: "city" });
    setCp("");
  }

  function usarGps() {
    setAviso(null);
    if (!("geolocation" in navigator)) {
      setAviso("Tu navegador no comparte ubicación.");
      return;
    }
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        guardar({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: "gps" });
        setBuscando(false);
      },
      () => {
        setBuscando(false);
        setAviso("No pudimos obtener tu ubicación. Escribe tu código postal.");
      },
      { timeout: 8000, maximumAge: 600000 },
    );
  }

  return (
    <div className="text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted">
          {current ? "Estás en" : "¿Dónde estás?"}
        </span>

        {current ? (
          <>
            <span className="rounded-pill bg-surface-2 px-3 py-1.5 font-semibold text-ink">
              {current.city ?? "Tu ubicación"}
            </span>
            <button
              type="button"
              onClick={() => guardar(null)}
              className="text-muted underline decoration-line underline-offset-2 transition hover:text-accent"
            >
              cambiar
            </button>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <input
                value={cp}
                onChange={(e) => setCp(e.target.value.replace(/\D/g, "").slice(0, 5))}
                onKeyDown={(e) => e.key === "Enter" && usarCp()}
                inputMode="numeric"
                placeholder="Código postal"
                aria-label="Tu código postal"
                className="w-32 rounded-pill border border-line bg-surface px-3.5 py-1.5 text-ink outline-none transition placeholder:text-muted focus:border-accent"
              />
              <button
                type="button"
                onClick={usarCp}
                className="rounded-pill border border-line bg-surface px-3.5 py-1.5 font-semibold text-ink transition hover:border-accent hover:text-accent"
              >
                Usar
              </button>
            </span>

            <button
              type="button"
              onClick={usarGps}
              className="rounded-pill border border-line bg-surface px-3.5 py-1.5 font-semibold text-ink transition hover:border-accent hover:text-accent"
            >
              {buscando ? "Buscando…" : "Usar mi ubicación"}
            </button>

            <select
              value=""
              onChange={(e) => {
                const ciudad = CITIES.find((c) => c.name === e.target.value);
                if (ciudad) guardar({ ...ciudad, source: "city" });
              }}
              aria-label="Elige tu ciudad"
              className="rounded-pill border border-line bg-surface px-3.5 py-1.5 font-semibold text-ink outline-none transition hover:border-accent focus:border-accent"
            >
              <option value="">o elige ciudad…</option>
              {CITIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {aviso && <p className="mt-2 text-warn">{aviso}</p>}
    </div>
  );
}
