"use client";

import { useActionState } from "react";
import { pedirLink, type EstadoEntrar } from "@/app/entrar/actions";

const INICIAL: EstadoEntrar = { ok: false, mensaje: "" };

export default function LoginForm({ next }: { next: string }) {
  const [estado, accion, pendiente] = useActionState(pedirLink, INICIAL);

  if (estado.ok) {
    return (
      <div className="rounded-card border border-ok-line bg-ok-bg p-5">
        <p className="text-[15px] font-semibold text-ok">Revisa tu correo</p>
        <p className="mt-1 text-[14px] leading-relaxed text-ink">{estado.mensaje}</p>
        <p className="mt-3 text-[13px] text-muted">
          El link sirve una vez y expira. Si no llega en un par de minutos, busca en
          spam o pídelo otra vez.
        </p>
      </div>
    );
  }

  return (
    <form action={accion} className="mt-6">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="block text-[13px] font-semibold text-ink">
        Tu correo
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        defaultValue={estado.correo ?? ""}
        placeholder="tu@correo.com"
        className="mt-1.5 w-full rounded-control border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none transition focus:border-accent"
      />
      {estado.mensaje && !estado.ok && (
        <p className="mt-2 text-[13px] text-warn">{estado.mensaje}</p>
      )}
      <button
        type="submit"
        disabled={pendiente}
        className="mt-4 w-full rounded-pill bg-accent px-5 py-2.5 text-[15px] font-semibold text-accent-ink shadow-card transition hover:shadow-lift disabled:opacity-50"
      >
        {pendiente ? "Enviando…" : "Mándame el link"}
      </button>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        No hay contraseña que recordar: te llega un link y con eso entras. Usamos
        tu correo para avisarte de tus comandas y de las cartas de tu wishlist,
        nada más.
      </p>
    </form>
  );
}
