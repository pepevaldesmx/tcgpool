"use client";

import { createBrowserClient } from "@supabase/ssr";
import { authKey, authUrl } from "@/lib/auth/config";

/** Cliente del navegador: sólo se usa para pedir el link de acceso. */
export function authBrowserClient() {
  const url = authUrl();
  const key = authKey();
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
