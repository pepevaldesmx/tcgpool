import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { authKey, authUrl, isAuthConfigured } from "@/lib/auth/config";

/**
 * Cliente de identidad del lado del servidor.
 *
 * La sesión vive en cookies, no en memoria: el servidor tiene que poder
 * reconocer a quien pide una página sin preguntarle a nadie más. `cookies()` es
 * asíncrono en esta versión de Next, así que se resuelve antes de armar el
 * adaptador.
 */
export async function authServerClient() {
  if (!isAuthConfigured()) return null;
  const store = await cookies();

  return createServerClient(authUrl()!, authKey()!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        // Escribir cookies desde un Server Component es un error en Next; sólo
        // funciona en acciones y route handlers. Se ignora en vez de tronar:
        // el refresco de sesión lo hace la ruta de callback, que sí puede.
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          /* render de sólo lectura */
        }
      },
    },
  });
}

/** El usuario de Supabase, o null. No toca nuestra base. */
export async function authUser() {
  if (!isAuthConfigured()) return null;

  // Sin cookie de sesión no hay a quién validar. El atajo importa porque esto
  // corre en el layout, o sea en CADA página: preguntarle al proveedor de
  // identidad por un visitante anónimo es un viaje de red por vista, y la
  // mayoría de las vistas son anónimas.
  const store = await cookies();
  const traeSesion = store.getAll().some((c) => c.name.startsWith("sb-"));
  if (!traeSesion) return null;

  const client = await authServerClient();
  if (!client) return null;
  // getUser() valida el token contra Supabase. getSession() lee la cookie sin
  // verificarla, y una cookie es algo que el visitante controla.
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}
