import { isConfigured } from "@/lib/db";
import {
  type AppUser,
  type Membership,
  getUserByAuthId,
  linkAuthUser,
  listMemberships,
} from "@/lib/db/accounts";
import { authUser } from "@/lib/auth/server";

/**
 * Quién está usando la plataforma, en NUESTROS términos.
 *
 * Supabase dice "este correo probó que es suyo"; de ahí para adelante la
 * identidad que importa es la fila de `users`, porque es a ella que cuelgan
 * membresías, comandas y wishlist. `auth_id` es el puente entre las dos.
 */
export interface Sesion {
  user: AppUser;
  memberships: Membership[];
}

/**
 * El administrador se declara por configuración, no se gana por llegar primero.
 *
 * La tentación era "si no hay admins, el primero que entre lo es": eso convierte
 * a cualquiera que descubra la URL antes que nosotros en dueño de la
 * plataforma. Una lista de correos en el entorno no se puede tomar desde el
 * navegador.
 */
export function esCorreoAdmin(email: string): boolean {
  const lista = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return lista.includes(email.trim().toLowerCase());
}

/** La sesión actual, o null si nadie entró. No tira si falta configuración. */
export async function getSesion(): Promise<Sesion | null> {
  if (!isConfigured()) return null;

  const identidad = await authUser();
  if (!identidad?.email) return null;

  // En el caso normal esto es UNA lectura: la fila ya está ligada. El enlace
  // sólo ocurre el primer día de cada persona.
  let user = await getUserByAuthId(identidad.id);
  if (!user) {
    const nombre =
      typeof identidad.user_metadata?.name === "string" ? identidad.user_metadata.name : null;
    user = await linkAuthUser({ authId: identidad.id, email: identidad.email, name: nombre });
  }

  return {
    user: { ...user, isAdmin: user.isAdmin || esCorreoAdmin(user.email) },
    memberships: await listMemberships(user.id),
  };
}

/** Igual que `getSesion`, pero sin cargar membresías. */
export async function getUsuarioActual(): Promise<AppUser | null> {
  return (await getSesion())?.user ?? null;
}
