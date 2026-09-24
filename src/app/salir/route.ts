import { NextResponse, type NextRequest } from "next/server";
import { authServerClient } from "@/lib/auth/server";

/**
 * Salir es POST, no GET.
 *
 * Con GET, cualquier imagen o link ajeno apuntando a `/salir` sacaría a la
 * persona de su sesión sin que lo pidiera.
 */
export async function POST(request: NextRequest) {
  const client = await authServerClient();
  await client?.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
