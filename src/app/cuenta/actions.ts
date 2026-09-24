"use server";

import { revalidatePath } from "next/cache";
import { updateProfile } from "@/lib/db/accounts";
import { getSesion } from "@/lib/auth/session";

/**
 * Guardar nombre y teléfono.
 *
 * El id del usuario NO viene del formulario: sale de la sesión. Si viniera del
 * formulario, cambiar un número editaría el perfil de otra persona.
 */
export async function guardarPerfil(formData: FormData): Promise<void> {
  const sesion = await getSesion();
  if (!sesion) throw new Error("No autorizado");

  const nombre = String(formData.get("name") ?? "").trim();
  const telefono = String(formData.get("phone") ?? "").trim();

  // Vacío es null y no cadena vacía: la UI pregunta `?? correo`, y un '' pasaría
  // esa pregunta y pintaría un hueco donde debería ir el nombre.
  await updateProfile(sesion.user.id, {
    name: nombre || null,
    phone: telefono || null,
  });
  revalidatePath("/cuenta");
}
