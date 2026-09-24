import { one, query } from "@/lib/db";

/**
 * SQL de cuentas y pertenencias.
 *
 * Vive aparte de `queries.ts` —que es el catálogo— porque no es catálogo: son
 * las personas y su relación con los vendedores. La regla de que las pantallas
 * no hablan con Postgres directo se mantiene igual.
 */

export interface AppUser {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  isAdmin: boolean;
}

export interface Membership {
  sellerId: number;
  sellerSlug: string;
  sellerName: string;
  sellerType: string;
  role: string;
  storeId: number | null;
  storeSlug: string | null;
  storeName: string | null;
}

interface UserRow {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  is_admin: boolean;
}

function toUser(row: UserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    isAdmin: row.is_admin,
  };
}

const CAMPOS = "id, email, name, phone, is_admin";

export async function getUserByAuthId(authId: string): Promise<AppUser | null> {
  const row = await one<UserRow>(`SELECT ${CAMPOS} FROM users WHERE auth_id = $1`, [authId]);
  return row ? toUser(row) : null;
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const row = await one<UserRow>(`SELECT ${CAMPOS} FROM users WHERE lower(email) = lower($1)`, [
    email,
  ]);
  return row ? toUser(row) : null;
}

/**
 * Convierte una sesión del proveedor de identidad en nuestro usuario.
 *
 * Se ADOPTA la fila que ya exista con ese correo en vez de crear otra. Es el
 * caso normal, no el raro: el admin da de alta una tienda y le concede la
 * membresía por correo ANTES de que el dueño haya entrado nunca; cuando entra,
 * su `auth_id` se pega a esa fila y se encuentra su panel ya armado. Crear una
 * segunda fila lo dejaría sin tienda y el índice único por correo reventaría.
 */
export async function linkAuthUser(input: {
  authId: string;
  email: string;
  name?: string | null;
}): Promise<AppUser> {
  const yaLigado = await getUserByAuthId(input.authId);
  if (yaLigado) return yaLigado;

  const porCorreo = await getUserByEmail(input.email);
  if (porCorreo) {
    const row = await one<UserRow>(
      `UPDATE users
          SET auth_id = $1,
              -- El nombre del proveedor sólo rellena lo que está vacío: si la
              -- persona ya escribió el suyo aquí, ése gana.
              name    = COALESCE(name, $2)
        WHERE id = $3
        RETURNING ${CAMPOS}`,
      [input.authId, input.name ?? null, porCorreo.id],
    );
    return toUser(row!);
  }

  const row = await one<UserRow>(
    `INSERT INTO users (email, auth_id, name)
     VALUES ($1, $2, $3)
     -- Dos pestañas entrando a la vez llegan aquí las dos; la segunda adopta.
     ON CONFLICT (lower(email)) DO UPDATE
       SET auth_id = COALESCE(users.auth_id, EXCLUDED.auth_id),
           name    = COALESCE(users.name, EXCLUDED.name)
     RETURNING ${CAMPOS}`,
    [input.email, input.authId, input.name ?? null],
  );
  return toUser(row!);
}

/**
 * Escribe el perfil tal cual, sin COALESCE: null BORRA.
 *
 * Con COALESCE no habría manera de quitarse un teléfono que se capturó mal, y
 * un campo que no se puede vaciar se vuelve un dato equivocado permanente.
 */
export async function updateProfile(
  userId: number,
  input: { name: string | null; phone: string | null },
): Promise<void> {
  await query(`UPDATE users SET name = $2, phone = $3 WHERE id = $1`, [
    userId,
    input.name,
    input.phone,
  ]);
}

interface MembershipRow {
  seller_id: number;
  seller_slug: string;
  seller_name: string;
  seller_type: string;
  role: string;
  store_id: number | null;
  store_slug: string | null;
  store_name: string | null;
}

/** Los vendedores que esta persona administra. Vacío = sólo compra. */
export async function listMemberships(userId: number): Promise<Membership[]> {
  const rows = await query<MembershipRow>(
    `SELECT s.id   AS seller_id,
            s.slug AS seller_slug,
            s.name AS seller_name,
            s.type AS seller_type,
            m.role,
            st.id   AS store_id,
            st.slug AS store_slug,
            st.name AS store_name
       FROM memberships m
       JOIN sellers s ON s.id = m.seller_id
       -- Sólo un vendedor de tipo 'store' administra una tienda. Para un
       -- afiliado, store_id es la tienda que lo AVALA: pertenecer a ella no
       -- le da su panel, y unir sin distinguir se lo habría dado.
       LEFT JOIN stores st ON st.id = s.store_id AND s.type = 'store'
      WHERE m.user_id = $1
      ORDER BY s.name`,
    [userId],
  );
  return rows.map((r) => ({
    sellerId: r.seller_id,
    sellerSlug: r.seller_slug,
    sellerName: r.seller_name,
    sellerType: r.seller_type,
    role: r.role,
    storeId: r.store_id,
    storeSlug: r.store_slug,
    storeName: r.store_name,
  }));
}

/**
 * ¿Puede esta persona administrar esta tienda?
 *
 * Se pregunta por SLUG porque es lo que trae la URL, y se resuelve contra la
 * base en cada acción: adivinar el slug de otra tienda no debe alcanzar para
 * editar su inventario.
 */
export async function membershipForStoreSlug(
  userId: number,
  storeSlug: string,
): Promise<Membership | null> {
  const todas = await listMemberships(userId);
  return todas.find((m) => m.storeSlug === storeSlug) ?? null;
}

export async function grantMembership(input: {
  email: string;
  sellerId: number;
  role?: string;
}): Promise<number> {
  // Sin `auth_id`: la persona todavía no ha entrado. `linkAuthUser` adopta esta
  // fila cuando lo haga.
  const user = await one<{ id: number }>(
    `INSERT INTO users (email)
     VALUES ($1)
     ON CONFLICT (lower(email)) DO UPDATE SET email = users.email
     RETURNING id`,
    [input.email],
  );
  await query(
    `INSERT INTO memberships (user_id, seller_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, seller_id) DO UPDATE SET role = EXCLUDED.role`,
    [user!.id, input.sellerId, input.role ?? "owner"],
  );
  return user!.id;
}

export async function revokeMembership(userId: number, sellerId: number): Promise<void> {
  await query(`DELETE FROM memberships WHERE user_id = $1 AND seller_id = $2`, [userId, sellerId]);
}

/** Cuántos administradores hay. Si es 0, el primero que entre puede serlo. */
export async function countAdmins(): Promise<number> {
  const row = await one<{ n: string }>(`SELECT count(*)::text AS n FROM users WHERE is_admin`);
  return Number.parseInt(row?.n ?? "0", 10);
}
