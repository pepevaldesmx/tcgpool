import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { MARCA } from "@/lib/brand";
import { isAuthConfigured } from "@/lib/auth/config";
import { rutaSegura } from "@/lib/auth/origin";
import { getSesion } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrar",
  description: `Entra a ${MARCA} con un link a tu correo.`,
  robots: { index: false, follow: false },
};

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const destino = rutaSegura(next);

  const sesion = await getSesion();
  if (sesion) redirect(destino);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-14">
      <h1 className="text-3xl font-bold tracking-tight">Entrar a {MARCA}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Con tu cuenta armas comandas, guardas cartas en tu wishlist y —si tienes
        tienda o eres afiliado— administras tu inventario.
      </p>

      {error && (
        <p className="mt-5 rounded-card border border-warn-line bg-warn-bg px-4 py-3 text-[14px] text-warn">
          {error === "expirado"
            ? "Ese link ya se usó o expiró. Pide uno nuevo."
            : "No se pudo completar el acceso. Pide un link nuevo."}
        </p>
      )}

      {isAuthConfigured() ? (
        <LoginForm next={destino} />
      ) : (
        <p className="mt-6 rounded-card border border-warn-line bg-warn-bg px-4 py-3 text-[14px] leading-relaxed text-warn">
          Las cuentas todavía no están configuradas en este servidor. El buscador
          funciona sin cuenta: <Link href="/buscar" className="underline">busca una carta</Link>.
        </p>
      )}
    </div>
  );
}
