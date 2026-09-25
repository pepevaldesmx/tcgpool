/**
 * Configuración del cobro. Stripe.
 *
 * La llave secreta NUNCA lleva el prefijo `NEXT_PUBLIC_`: eso la mandaría al
 * navegador, y una llave secreta en el navegador es una llave publicada. Lo que
 * sí puede viajar al cliente es la publicable, cuando haga falta montar el
 * formulario de tarjeta.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
}
