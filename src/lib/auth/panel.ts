import { getStoreBySlugPanel, getStoreByPanelToken, type PanelStore } from "@/lib/db/queries";
import { membershipForStoreSlug } from "@/lib/db/accounts";
import { getSesion } from "@/lib/auth/session";

/**
 * Quién puede abrir el panel de una tienda.
 *
 * Dos llaves a la vez, a propósito: la MEMBRESÍA (lo definitivo) y el TOKEN del
 * link (TRANSITORIO). Matar el token el mismo día que aparecen las cuentas
 * dejaría el panel muerto entre un deploy y el otro, y a las tiendas que ya
 * tienen su link sin entrar mientras crean su cuenta. Se retira cuando las tres
 * tiendas hayan entrado con correo.
 */
export type ViaPanel = "membresía" | "token";

export async function abrirPanel(
  slug: string,
  token: string,
): Promise<{ store: PanelStore; via: ViaPanel } | null> {
  if (token) {
    const store = await getStoreByPanelToken(token);
    // El token resuelve la tienda; comparar el slug evita que un token válido
    // abra el panel de otra tienda por cambiar una palabra en la URL.
    if (store && store.slug === slug) return { store, via: "token" };
    // Un token equivocado no cae a la sesión: si lo trae, es lo que quiso usar.
    return null;
  }

  const sesion = await getSesion();
  if (!sesion) return null;
  const membresía = await membershipForStoreSlug(sesion.user.id, slug);
  if (!membresía) return null;

  const store = await getStoreBySlugPanel(slug);
  return store ? { store, via: "membresía" } : null;
}
