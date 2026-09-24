import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { authServerClient } from "@/lib/auth/server";
import { rutaSegura } from "@/lib/auth/origin";
import { getSesion } from "@/lib/auth/session";

/**
 * Donde aterriza el link del correo.
 *
 * Un route handler y no una página porque aquí SÍ se pueden escribir cookies: la
 * sesión se guarda en este paso. Se aceptan las dos formas en que Supabase puede
 * devolver a la persona —`code` (el flujo normal, con verificador PKCE) y
 * `token_hash` (si la plantilla del correo se cambia a la variante de token)—
 * para que cambiar la plantilla no rompa el acceso.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const destino = rutaSegura(url.searchParams.get("next"));
  const aquí = (ruta: string) => NextResponse.redirect(new URL(ruta, url.origin));

  // Supabase puede rebotar con el error ya resuelto (link vencido, por ejemplo).
  if (url.searchParams.get("error")) {
    return aquí(`/entrar?error=expirado&next=${encodeURIComponent(destino)}`);
  }

  const client = await authServerClient();
  if (!client) return aquí("/entrar");

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await client.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await client.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("sin código") };

  if (error) {
    return aquí(`/entrar?error=expirado&next=${encodeURIComponent(destino)}`);
  }

  // Ligar la fila de `users` AQUÍ y no en el primer render: es una escritura, y
  // este es el único momento del flujo que existe una sola vez por acceso.
  try {
    await getSesion();
  } catch (err) {
    // La sesión ya quedó guardada; si la base falla, entrar no debe fallar.
    console.error("[auth] no se pudo ligar el usuario:", err);
  }

  return aquí(destino);
}
