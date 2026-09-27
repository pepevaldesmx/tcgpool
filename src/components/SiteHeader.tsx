"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SearchBox from "@/components/SearchBox";

/**
 * La barra del sitio.
 *
 * SIEMPRE es oscura, y eso lo decide el logo, no el gusto: la mitad derecha de
 * la palabra son letras blancas sobre transparencia —sin tarjeta turquesa
 * detrás— así que sobre papel "etitlán" desaparece y la marca se lee a medias.
 * Montarlo en una placa oscura dentro de una barra clara se ve como un parche;
 * la barra entera oscura se lee como una cinta de navegación y deja las páginas
 * claras debajo.
 *
 * Tiene dos modos: sobre el héroe flota en un degradado de la propia foto, y en
 * el resto del sitio es una banda oscura sólida. Es un componente de cliente
 * sólo para saber en qué ruta está; los datos de la sesión los resuelve el
 * servidor y bajan por props, porque la sesión no se consulta desde el
 * navegador.
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

export default function SiteHeader({ usuario }: { usuario: UsuarioBarra | null }) {
  const ruta = usePathname();
  const sobreHeroe = ruta === "/";

  const claseBarra = sobreHeroe
    ? "absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-scrim/90 via-scrim/55 to-transparent pb-6"
    : "bg-night";

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
          <SearchBox size="sm" tono="noche" />
        </div>

        {/* Mismo relleno que "Buscar": son los dos motores de búsqueda y
            ninguno es secundario del otro. */}
        <Link
          href="/lista"
          className="hidden h-11 shrink-0 items-center rounded-pill bg-accent-night px-5 text-[14px] font-bold text-night transition hover:brightness-110 sm:inline-flex"
        >
          Buscar lista
        </Link>

        {usuario ? (
          <Link
            href="/cuenta"
            className="group inline-flex shrink-0 items-center gap-2.5"
            title={usuario.correo}
          >
            <span className="grid h-9 w-9 place-items-center rounded-pill bg-accent-night text-[13px] font-bold text-night">
              {iniciales(usuario)}
            </span>
            <span className="hidden max-w-[10rem] truncate text-[14px] font-semibold text-night-ink transition group-hover:text-accent-night sm:block">
              {usuario.nombre || usuario.correo}
            </span>
          </Link>
        ) : (
          <Link href="/entrar" className="group inline-flex shrink-0 items-center gap-2.5">
            {/* Placeholder: la silueta de siempre, para que el lugar del avatar
                exista desde antes de que haya cuenta. */}
            <span className="grid h-9 w-9 place-items-center rounded-pill border border-night-line text-night-muted">
              <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="currentColor">
                <circle cx="12" cy="8.5" r="3.6" />
                <path d="M12 13.5c-3.6 0-6.5 2.2-6.5 5v.5h13V18.5c0-2.8-2.9-5-6.5-5Z" />
              </svg>
            </span>
            <span className="text-[14px] font-semibold text-night-ink transition group-hover:text-accent-night">
              Iniciar sesión
            </span>
          </Link>
        )}
      </div>
    </header>
  );
}
