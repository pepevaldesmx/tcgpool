/**
 * Configuración de Supabase Auth.
 *
 * Son dos variables distintas de `DATABASE_URL`: aquélla es la conexión directa
 * a Postgres que usa el servidor; éstas son el proyecto y la llave pública que
 * el NAVEGADOR usa para hablar con el servicio de identidad. La llave anónima
 * es pública a propósito —viaja al cliente— y no da acceso a la base: lo que
 * protege los datos son las políticas del lado de Supabase y, en nuestro caso,
 * que todo el SQL pase por el servidor.
 */
export function authUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
}

export function authKey(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null;
}

/** Sin esto no hay cuentas, pero el catálogo sigue funcionando sin ellas. */
export function isAuthConfigured(): boolean {
  return Boolean(authUrl() && authKey());
}
