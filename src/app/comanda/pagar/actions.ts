"use server";

import { redirect } from "next/navigation";
import { aplicarRevision } from "@/lib/db/comandas";
import { huellaRevision } from "@/lib/comanda/revalidar";
import { isStripeConfigured } from "@/lib/pagos/config";
import { getSesion } from "@/lib/auth/session";
import { revisarComandaAbierta } from "./revision";

/**
 * Aceptar los cambios y cobrar.
 *
 * Se vuelve a revisar aquí, no se confía en lo que trae el formulario: entre que
 * la persona vio la pantalla y apretó el botón, el mundo se pudo mover otra vez.
 * La huella que viaja en el formulario es la forma de lo que se le ENSEÑÓ; si no
 * coincide con la de ahora, se le vuelve a enseñar y NO se cobra. Cobrar algo
 * distinto de lo que aceptó es la manera más rápida de perder su confianza.
 */
export async function aceptarYPagar(formData: FormData): Promise<void> {
  const sesion = await getSesion();
  if (!sesion) redirect("/entrar?next=%2Fcomanda%2Fpagar");

  const completa = await revisarComandaAbierta(sesion.user.id);
  if (!completa) redirect("/comanda");

  const { comanda, revision } = completa;

  // Un renglón de una tienda de muestra tiene precio y stock sintéticos: cobrarlo
  // sería vender una carta que no existe. El freno está en el modelo y se vuelve
  // a comprobar aquí, porque es aquí donde se cobraría.
  if (!comanda.cobrable) redirect("/comanda");

  if (String(formData.get("huella") ?? "") !== huellaRevision(revision)) {
    redirect("/comanda/pagar?semovio=1");
  }

  await aplicarRevision(comanda.id, sesion.user.id, revision);

  if (!isStripeConfigured()) {
    // La comanda ya quedó como el mundo la dejó; lo que falta es el cobro.
    redirect("/comanda/pagar?falta=stripe");
  }

  // Aquí va el PaymentIntent de Stripe. El cobro se confirma por webhook y no
  // por el regreso del navegador: si la persona cierra la pestaña, el cobro
  // ocurrió igual y la comanda tiene que enterarse.
  redirect("/comanda/pagar?falta=stripe");
}
