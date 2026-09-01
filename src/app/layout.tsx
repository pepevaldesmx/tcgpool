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
          <header className="border-b border-ink-800/80 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 py-4">
              <Link href="/" className="group flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-sm font-black text-ink-950">
                  TP
                </span>
                <span className="text-[15px] font-semibold tracking-tight">
                  TCG<span className="text-brand-400">Pool</span>
                </span>
              </Link>
              <nav className="ml-auto flex items-center gap-1 text-sm">
                <Link
                  href="/buscar"
                  className="rounded-lg px-3 py-1.5 text-ink-300 transition hover:bg-ink-800/70 hover:text-ink-100"
                >
                  Buscar
                </Link>
                <Link
                  href="/tiendas"
                  className="rounded-lg px-3 py-1.5 text-ink-300 transition hover:bg-ink-800/70 hover:text-ink-100"
                >
                  Tiendas
                </Link>
              </nav>
            </div>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="border-t border-ink-800/80">
            <div className="mx-auto w-full max-w-6xl px-4 py-8 text-xs leading-relaxed text-ink-500">
              <p>
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
