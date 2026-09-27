"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SearchBox from "@/components/SearchBox";

/**
 * La barra del sitio.
 *
 * Tiene dos modos porque el héroe es la única banda oscura de la casa: encima
 * de él la barra flota sobre un degradado de la propia foto, y en el resto del
 * sitio es sólida sobre papel. Es un componente de cliente sólo para saber en
 * qué ruta está; los datos de la sesión los resuelve el servidor y bajan por
 * props, porque la sesión no se consulta desde el navegador.
 *
 * El logo funciona en los dos fondos: las letras son blancas caladas sobre
 * tarjetas turquesa, así que lo que da el contraste es la tarjeta y no el papel.
 */
export interface UsuarioBarra {
  nombre: string;
  correo: string;
}

function iniciales(u: UsuarioBarra): string {
  const base = (u.nombre || u.correo).trim();
  const partes = base.split(/[\s@._-]+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function SiteHeader({
  usuario,
  enComanda,
}: {
  usuario: UsuarioBarra | null;
  enComanda: number;
}) {
  const ruta = usePathname();
  const sobreHeroe = ruta === "/";

  const claseBarra = sobreHeroe
    ? "absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-night/95 via-night/70 to-transparent pb-6"
    : "border-b border-line bg-paper";

  const tono = sobreHeroe ? "noche" : "papel";
  const textoTenue = sobreHeroe ? "text-night-muted" : "text-muted";
  const textoFuerte = sobreHeroe ? "text-night-ink" : "text-ink";
  const bordeChip = sobreHeroe ? "border-night-line" : "border-line";
  const acento = sobreHeroe ? "hover:text-accent-night" : "hover:text-accent";

  return (
    <header className={claseBarra}>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
        <Link href="/" className="shrink-0" aria-label="Inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.webp"
            alt="Tecegetitlán"
            width={640}
            height={297}
            className="h-9 w-auto sm:h-10"
          />
        </Link>

        {/* El buscador vive en la barra: es a lo que viene la gente, y tenerlo
            en todas las pantallas evita el viaje de regreso al inicio. */}
        <div className="order-3 w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
          <SearchBox size="sm" tono={tono} />
        </div>

        <Link
          href="/lista"
          className={`hidden h-11 shrink-0 items-center rounded-pill border px-4 text-[14px] font-semibold transition sm:inline-flex ${bordeChip} ${textoFuerte} ${acento}`}
        >
          Buscar lista
        </Link>

        <Link
          href="/comanda"
          className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-pill border px-4 text-[14px] font-semibold transition ${bordeChip} ${textoFuerte} ${acento}`}
        >
          Comanda
          {enComanda > 0 && (
            <span
              className={`rounded-pill px-2 py-0.5 text-[12px] font-bold tnum ${
                sobreHeroe ? "bg-accent-night text-night" : "bg-accent text-accent-ink"
              }`}
            >
              {enComanda}
            </span>
          )}
        </Link>

        {usuario ? (
          <Link
            href="/cuenta"
            className="group inline-flex shrink-0 items-center gap-2.5"
            title={usuario.correo}
          >
            <span
              className={`grid h-9 w-9 place-items-center rounded-pill text-[13px] font-bold ${
                sobreHeroe ? "bg-accent-night text-night" : "bg-accent text-accent-ink"
              }`}
            >
              {iniciales(usuario)}
            </span>
            <span
              className={`hidden max-w-[10rem] truncate text-[14px] font-semibold transition sm:block ${textoFuerte} ${acento}`}
            >
              {usuario.nombre || usuario.correo}
            </span>
          </Link>
        ) : (
          <Link href="/entrar" className="group inline-flex shrink-0 items-center gap-2.5">
            {/* Placeholder: la silueta de siempre, para que el lugar del avatar
                exista desde antes de que haya cuenta. */}
            <span
              className={`grid h-9 w-9 place-items-center rounded-pill border ${bordeChip} ${textoTenue}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="currentColor">
                <circle cx="12" cy="8.5" r="3.6" />
                <path d="M12 13.5c-3.6 0-6.5 2.2-6.5 5v.5h13V18.5c0-2.8-2.9-5-6.5-5Z" />
              </svg>
            </span>
            <span className={`text-[14px] font-semibold transition ${textoFuerte} ${acento}`}>
              Iniciar sesión
            </span>
          </Link>
        )}
      </div>
    </header>
  );
}
