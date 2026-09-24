import { headers } from "next/headers";

/**
 * El dominio por el que llegó la petición.
 *
 * El link de acceso tiene que regresar a DONDE está la persona: quemar el
 * dominio de producción manda a quien prueba en local a la app de producción, y
 * quemar el de Vercel rompe el día que haya dominio propio. `NEXT_PUBLIC_SITE_URL`
 * sólo se usa si no hay encabezados (scripts, pruebas).
 */
export async function origenDeLaPeticion(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Valida el destino después de entrar.
 *
 * Es un parámetro de la URL, o sea entrada de quien sea. Sin esto, un link a
 * `/entrar?next=https://otrositio` usaría nuestro login como trampolín: la
 * persona entra de verdad y acaba en otra parte creyendo que sigue aquí.
 * Sólo se aceptan rutas de esta app, y `//` queda fuera porque el navegador la
 * lee como otro dominio.
 */
export function rutaSegura(next: string | null | undefined, porDefecto = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return porDefecto;
  return next;
}
