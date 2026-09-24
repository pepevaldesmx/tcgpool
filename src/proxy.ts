import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refresca la sesión antes de que se renderice la página.
 *
 * El token de acceso dura una hora. Un Server Component no puede escribir
 * cookies, así que si el refresco se intentara ahí, el token nuevo se perdería
 * y la persona acabaría desconectada a media compra aunque su sesión fuera
 * válida. Aquí sí se puede escribir, y corre antes de todo.
 *
 * En Next 16 el archivo se llama `proxy`, no `middleware`.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });

  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        // La respuesta se rearma con las cookies ya puestas en la petición para
        // que el render de esta misma vuelta vea la sesión nueva.
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Basta con pedir el usuario: eso es lo que dispara el refresco.
  await client.auth.getUser();

  return response;
}

export const config = {
  // Sin matcher corre también sobre imágenes y estáticos: una llamada de red al
  // proveedor de identidad por cada icono.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
