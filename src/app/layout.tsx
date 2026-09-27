import type { Metadata } from "next";
import Link from "next/link";
import { MARCA, MARCA_TITULO } from "@/lib/brand";
import { isConfigured } from "@/lib/db";
import { getProvenance, type Provenance } from "@/lib/db/queries";
import NotConfigured from "@/components/NotConfigured";
import { getUserLocation } from "@/lib/location-server";
import { getSesion } from "@/lib/auth/session";
import { countOpenComandaCopies } from "@/lib/db/comandas";
import LocationPicker from "@/components/LocationPicker";
import SiteHeader from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: MARCA_TITULO,
    template: `%s · ${MARCA}`,
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

  // La sesión es decoración de la barra, igual que la procedencia: si el
  // proveedor de identidad no responde, el buscador sigue funcionando sin cuenta.
  let sesion = null;
  let enComanda = 0;
  try {
    sesion = await getSesion();
    if (sesion) enComanda = await countOpenComandaCopies(sesion.user.id);
  } catch (err) {
    console.error("[layout] no se pudo leer la sesión:", err);
  }

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
        <div className="relative flex min-h-screen flex-col">
          <SiteHeader
            usuario={
              sesion ? { nombre: sesion.user.name ?? "", correo: sesion.user.email } : null
            }
          />

          <main className="flex-1">{children}</main>

          <footer className="mt-8 border-t border-line">
            <div className="mx-auto w-full max-w-6xl aire py-9 text-[13px] leading-relaxed text-muted">
              <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
                <LocationPicker current={location} />
                <Link href="/tiendas" className="font-semibold text-ink transition hover:text-accent">
                  Tiendas conectadas
                </Link>
                <Link href="/lista" className="font-semibold text-ink transition hover:text-accent">
                  Buscar una lista
                </Link>
                <Link href="/wishlist" className="font-semibold text-ink transition hover:text-accent">
                  Mi wishlist
                </Link>
                <Link href="/comanda" className="font-semibold text-ink transition hover:text-accent">
                  Mi comanda
                  {enComanda > 0 && (
                    <span className="ml-1.5 rounded-pill bg-accent px-2 py-0.5 text-[12px] font-bold text-accent-ink tnum">
                      {enComanda}
                    </span>
                  )}
                </Link>
              </div>
              <p className="max-w-3xl">
                {MARCA} agrega el catálogo público de tiendas mexicanas para que
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
