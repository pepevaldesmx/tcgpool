/**
 * La aritmética de una comanda. Funciones puras: se prueban sin base.
 *
 * Dos reglas que no son obvias y que ordenan todo lo demás:
 *
 * 1. **Nuestra comisión NO se suma, se resta.** De una comanda de $500 el
 *    usuario paga $500; de esos $500 salen las comisiones de cobro y la nuestra,
 *    y el resto se le paga a tiendas y afiliados. Sumarla encima subiría el
 *    precio de las cartas frente al de la tienda y nos pondría a competir con
 *    nuestros propios vendedores.
 * 2. **Envío y consolidación sí se cobran aparte**, porque no son cartas: son un
 *    servicio que pagamos al mensajero. Por eso viven en su propio renglón y no
 *    entran a la base del pago a vendedores.
 */

export type Entrega =
  | "recoger_en_cada_tienda"
  | "consolidar_y_recoger"
  | "envio_directo"
  | "consolidar_y_enviar";

export const ENTREGAS: Entrega[] = [
  "recoger_en_cada_tienda",
  "consolidar_y_recoger",
  "envio_directo",
  "consolidar_y_enviar",
];

export function esEntrega(v: string): v is Entrega {
  return (ENTREGAS as string[]).includes(v);
}

/** 2% nuestro + IVA = 2.32%. El 0.32% es del SAT, no ingreso. */
export const COMISION_BPS = 232;

/**
 * Comisión de cobro. SUPUESTO, no contrato: son las tarifas típicas de una
 * terminal mexicana (3.6% + $3, con IVA). Viven aquí, en un solo lugar y
 * declaradas como supuesto, para que el día que haya contrato se cambie un
 * número y no se persiga el porcentaje por toda la aplicación.
 */
export const PROCESAMIENTO_BPS = 418; // 3.6% + IVA
export const PROCESAMIENTO_FIJO_CENTS = 348; // $3.00 + IVA

export const CONSOLIDACION_CENTS = 5_000; // $50
export const ENVIO_POR_CIUDAD_CENTS = 10_000; // $100

export interface CostoEntrega {
  consolidationCents: number;
  shippingCents: number;
}

/**
 * Qué cuesta entregar.
 *
 * `ciudadesOrigen` es de cuántas ciudades distintas salen las cartas. Hoy
 * siempre es 1 —sólo CDMX— pero la regla foránea se modela igual para que el
 * día que se prenda otra ciudad no haya que reescribir el cobro: $100 por cada
 * ciudad de origen, porque cada una es una corrida y un paquete aparte.
 *
 * Los $50 de consolidación SÓLO se sostienen si hay lote: una corrida del
 * mensajero junta varias comandas de las mismas tiendas. Con una sola comanda,
 * ésa pagaría la corrida entera. Por eso la recolección va por días fijos —el
 * calendario es lo que fabrica la densidad— y no "cuando el usuario pague".
 */
export function costoEntrega(entrega: Entrega, ciudadesOrigen: number): CostoEntrega {
  const ciudades = Math.max(1, ciudadesOrigen);
  const consolida = entrega === "consolidar_y_recoger" || entrega === "consolidar_y_enviar";
  const envia = entrega === "envio_directo" || entrega === "consolidar_y_enviar";

  return {
    consolidationCents: consolida ? CONSOLIDACION_CENTS : 0,
    // Recoger en persona no paga envío ni cuando las cartas vienen de otra
    // ciudad: si el usuario va a la tienda, no hay paquete.
    shippingCents: envia ? ENVIO_POR_CIUDAD_CENTS * ciudades : 0,
  };
}

export interface Desglose {
  /** Las cartas, a su precio de tienda. */
  subtotalCents: number;
  consolidationCents: number;
  shippingCents: number;
  /** Lo que el usuario paga. */
  totalCents: number;
  /** Nuestro 2.32%, DESCONTADO del precio de las cartas. */
  commissionCents: number;
  /** Lo que cobra la terminal por el cargo completo. */
  processingCents: number;
  /** La parte de la terminal que corresponde a las cartas. Sale del vendedor. */
  processingCardsCents: number;
  /** La parte que corresponde al envío. Sale del envío, NO del vendedor. */
  processingShippingCents: number;
  /** Lo que se reparte entre tiendas y afiliados. */
  payoutCents: number;
  /** Lo que queda del envío para pagarle al mensajero. */
  deliveryNetCents: number;
}

export function desglosar(input: {
  subtotalCents: number;
  entrega: Entrega;
  ciudadesOrigen: number;
}): Desglose {
  const { subtotalCents } = input;
  const { consolidationCents, shippingCents } = costoEntrega(input.entrega, input.ciudadesOrigen);
  const totalCents = subtotalCents + consolidationCents + shippingCents;

  const commissionCents = Math.round((subtotalCents * COMISION_BPS) / 10_000);

  // La terminal cobra sobre TODO el cargo, cartas y envío juntos, porque es un
  // solo cobro a la tarjeta.
  const processingCents =
    totalCents > 0
      ? Math.round((totalCents * PROCESAMIENTO_BPS) / 10_000) + PROCESAMIENTO_FIJO_CENTS
      : 0;

  // Pero se PARTE, y cada parte la absorbe quien generó el cobro: la de las
  // cartas sale del vendedor, la del envío sale del envío. Cobrarle al vendedor
  // la comisión de un envío que él no cobró le quitaría dinero por un servicio
  // que no dio.
  //
  // El PORCENTAJE se reparte en proporción. La CUOTA FIJA, no: se carga entera a
  // las cartas, porque existe por haber un cobro y el cobro existe por la venta
  // —el envío es un añadido—. Prorratearla también hacía que al vendedor le
  // llegara distinto según cómo el comprador eligió recibir su pedido, que es una
  // decisión en la que el vendedor no tiene voz. Así su descuento no depende de
  // ella, y es algo que él puede verificar.
  //
  // La parte del envío es el RESIDUO, no otro redondeo: así las dos suman
  // exactamente lo que cobra la terminal, sin inventar ni perder un centavo.
  const envioCents = consolidationCents + shippingCents;
  const porcentaje = totalCents > 0 ? Math.round((totalCents * PROCESAMIENTO_BPS) / 10_000) : 0;
  const porcentajeCartas =
    totalCents > 0 ? Math.round((porcentaje * subtotalCents) / totalCents) : 0;
  const processingCardsCents = totalCents > 0 ? porcentajeCartas + PROCESAMIENTO_FIJO_CENTS : 0;
  const processingShippingCents = processingCents - processingCardsCents;

  return {
    subtotalCents,
    consolidationCents,
    shippingCents,
    totalCents,
    commissionCents,
    processingCents,
    processingCardsCents,
    processingShippingCents,
    // Nunca negativo: una carta de tres pesos no cubre la cuota fija de la
    // terminal, y un pago negativo no es un pago, es un error.
    payoutCents: Math.max(0, subtotalCents - commissionCents - processingCardsCents),
    // Esto sí puede quedar en negativo y tiene que verse: significa que el cobro
    // de entrega no alcanzó a pagar la corrida del mensajero.
    deliveryNetCents: envioCents - processingShippingCents,
  };
}

export const ETIQUETA_ENTREGA: Record<Entrega, string> = {
  recoger_en_cada_tienda: "Recoger en cada tienda",
  consolidar_y_recoger: "Consolidar en una tienda y recoger",
  envio_directo: "A domicilio",
  consolidar_y_enviar: "Consolidar y enviar a domicilio",
};
