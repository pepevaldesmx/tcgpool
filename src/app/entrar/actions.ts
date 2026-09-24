"use server";

import { authServerClient } from "@/lib/auth/server";
import { isAuthConfigured } from "@/lib/auth/config";
import { origenDeLaPeticion, rutaSegura } from "@/lib/auth/origin";

export interface EstadoEntrar {
  ok: boolean;
  mensaje: string;
  correo?: string;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Pide el link de acceso.
 *
 * No hay contraseña que administrar, recuperar ni filtrar: el correo ES la
 * prueba. Para una plataforma donde el trato es "te aviso cuando aparezca tu
 * carta", tener el correo verificado no es un trámite extra, es el producto.
 */
export async function pedirLink(_previo: EstadoEntrar, form: FormData): Promise<EstadoEntrar> {
  if (!isAuthConfigured()) {
    return { ok: false, mensaje: "Las cuentas todavía no están configuradas en este servidor." };
  }

  const correo = String(form.get("email") ?? "").trim();
  if (!CORREO.test(correo)) {
    return { ok: false, mensaje: "Escribe un correo válido." };
  }

  const client = await authServerClient();
  if (!client) {
    return { ok: false, mensaje: "Las cuentas todavía no están configuradas en este servidor." };
  }

  const destino = rutaSegura(String(form.get("next") ?? "/"));
  const origen = await origenDeLaPeticion();

  const { error } = await client.auth.signInWithOtp({
    email: correo,
    options: {
      emailRedirectTo: `${origen}/auth/callback?next=${encodeURIComponent(destino)}`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    // El mensaje del proveedor puede ser técnico; el de límite de envíos sí le
    // sirve a la persona, porque le dice que espere en vez de reintentar.
    const esLimite = error.status === 429;
    return {
      ok: false,
      mensaje: esLimite
        ? "Acabas de pedir un link. Espera un minuto antes de pedir otro."
        : "No se pudo enviar el link. Inténtalo de nuevo en un momento.",
      correo,
    };
  }

  return {
    ok: true,
    mensaje: `Te mandamos un link a ${correo}. Ábrelo en este mismo navegador.`,
    correo,
  };
}
