import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TCG Pool — busca cartas en tiendas mexicanas",
    template: "%s · TCG Pool",
  },
  description:
    "Busca una carta y mira qué tiendas mexicanas la tienen, en qué versión, condición y precio. Todo en una sola vista.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-line bg-surface">
            <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 py-3.5">
              <Link href="/" className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded bg-accent text-[11px] font-black text-accent-ink">
                  TP
                </span>
                <span className="font-serif text-[17px] font-bold tracking-tight">
                  TCG Pool
                </span>
              </Link>
              <nav className="ml-auto flex items-center gap-1 text-sm">
                <Link
                  href="/buscar"
                  className="rounded px-3 py-1.5 font-medium text-muted transition hover:bg-hover hover:text-ink"
                >
                  Buscar
                </Link>
                <Link
                  href="/lista"
                  className="rounded px-3 py-1.5 font-medium text-muted transition hover:bg-hover hover:text-ink"
                >
                  Listas
                </Link>
                <Link
                  href="/tiendas"
                  className="rounded px-3 py-1.5 font-medium text-muted transition hover:bg-hover hover:text-ink"
                >
                  Tiendas
                </Link>
              </nav>
            </div>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="mt-8 border-t border-line">
            <div className="mx-auto w-full max-w-6xl px-4 py-8 text-xs leading-relaxed text-muted">
              <p className="max-w-3xl">
                TCG Pool agrega el catálogo público de tiendas mexicanas para que
                encuentres una carta sin ir tienda por tienda. Los precios y el
                stock se toman del sitio de cada tienda y pueden cambiar; la
                compra siempre se cierra en la tienda.
              </p>
              <p className="mt-2">MVP · datos de demostración · hecho en México</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
