import type { Metadata } from "next";
import Link from "next/link";
import { isConfigured } from "@/lib/db";
import { getProvenance, type Provenance } from "@/lib/db/queries";
import NotConfigured from "@/components/NotConfigured";
import { getUserLocation } from "@/lib/location-server";
import LocationPicker from "@/components/LocationPicker";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TCG Pool — busca cartas en tiendas mexicanas",
    template: "%s · TCG Pool",
  },
  description:
    "Busca una carta y mira qué tiendas mexicanas la tienen, en qué versión, condición y precio. Todo en una sola vista.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Sin base no hay catálogo que mostrar. Se dice de frente, en un solo lugar,
  // en vez de dejar que cada página truene con un 500.
  if (!isConfigured()) {
    return (
      <html lang="es">
        <body className="font-sans antialiased">
          <NotConfigured />
        </body>
      </html>
    );
  }

  const location = await getUserLocation();

  // El aviso de procedencia es decoración, no contenido: si la base no responde
  // —o si es un build sin DATABASE_URL, donde Next prerenderiza el 404— la barra
  // y el pie se pintan igual. Las páginas con datos sí fallan ruidosamente.
  let provenance: Provenance = { live: 0, sample: 0, sampleNames: [] };
  try {
    provenance = await getProvenance();
  } catch (err) {
    console.error("[layout] no se pudo leer la procedencia:", err);
  }

  return (
    <html lang="es">
      <body className="font-sans antialiased">
        <div className="flex min-h-screen flex-col">
          {/* Barra deliberadamente callada: la marca no compite con el
              buscador, que es a lo que viene la gente. */}
          <header>
            <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 py-3">
              <Link
                href="/"
                className="text-[17px] font-bold tracking-tight text-ink"
              >
                TCG Pool
              </Link>
              <div className="ml-auto hidden sm:block">
                <LocationPicker current={location} />
              </div>
              <nav className="flex items-center gap-1 text-[14px]">
                <Link href="/buscar" className="rounded-pill px-3 py-1.5 font-medium text-muted transition hover:bg-surface hover:text-accent">
                  Buscar
                </Link>
                <Link href="/lista" className="rounded-pill px-3 py-1.5 font-medium text-muted transition hover:bg-surface hover:text-accent">
                  Listas
                </Link>
                <Link href="/tiendas" className="rounded-pill px-3 py-1.5 font-medium text-muted transition hover:bg-surface hover:text-accent">
                  Tiendas
                </Link>
              </nav>
            </div>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="mt-8 border-t border-line">
            <div className="mx-auto w-full max-w-6xl px-4 py-9 text-[13px] leading-relaxed text-muted">
              <p className="max-w-3xl">
                TCG Pool agrega el catálogo público de tiendas mexicanas para que
                encuentres una carta sin ir tienda por tienda. Los precios y el
                stock se toman del sitio de cada tienda y pueden cambiar; la
                compra siempre se cierra en la tienda.
              </p>
              <p className="mt-2">
                MVP ·{" "}
                {provenance.sample > 0
                  ? `${provenance.live} de ${provenance.live + provenance.sample} tiendas con catálogo real`
                  : provenance.live > 0
                    ? "catálogo real de todas las tiendas"
                    : "comparador de singles"}{" "}
                · hecho en México
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
