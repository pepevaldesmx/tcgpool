import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  costoEntrega,
  desglosar,
  CONSOLIDACION_CENTS,
  ENVIO_POR_CIUDAD_CENTS,
} from "@/lib/comanda/money";

describe("costoEntrega", () => {
  it("recoger en cada tienda es gratis", () => {
    assert.deepEqual(costoEntrega("recoger_en_cada_tienda", 1), {
      consolidationCents: 0,
      shippingCents: 0,
    });
  });

  it("consolidar y recoger cuesta $50", () => {
    assert.deepEqual(costoEntrega("consolidar_y_recoger", 1), {
      consolidationCents: CONSOLIDACION_CENTS,
      shippingCents: 0,
    });
  });

  it("consolidar y enviar son $150: los dos conceptos, no un paquete", () => {
    const c = costoEntrega("consolidar_y_enviar", 1);
    assert.equal(c.consolidationCents + c.shippingCents, 15_000);
  });

  it("cobra $100 por cada ciudad de origen", () => {
    assert.equal(costoEntrega("envio_directo", 3).shippingCents, ENVIO_POR_CIUDAD_CENTS * 3);
  });

  it("recoger no paga envío aunque las cartas vengan de otra ciudad", () => {
    // Si el usuario va por ellas, no hay paquete que pagar.
    assert.equal(costoEntrega("recoger_en_cada_tienda", 4).shippingCents, 0);
    assert.equal(costoEntrega("consolidar_y_recoger", 4).shippingCents, 0);
  });
});

describe("desglosar", () => {
  it("la comisión NO se le suma al usuario", () => {
    // De $500 el usuario paga $500. Sumarla encima subiría el precio de las
    // cartas frente al de la tienda.
    const d = desglosar({
      subtotalCents: 50_000,
      entrega: "recoger_en_cada_tienda",
      ciudadesOrigen: 1,
    });
    assert.equal(d.totalCents, 50_000);
    assert.equal(d.commissionCents, 1_160); // 2.32%
  });

  it("el envío sí se suma: no es carta, es servicio", () => {
    const d = desglosar({
      subtotalCents: 50_000,
      entrega: "consolidar_y_enviar",
      ciudadesOrigen: 1,
    });
    assert.equal(d.totalCents, 65_000);
    // Y no mueve nuestra comisión, que se calcula sobre las cartas.
    assert.equal(d.commissionCents, 1_160);
  });

  it("lo que se reparte sale del subtotal, no del total", () => {
    const d = desglosar({
      subtotalCents: 50_000,
      entrega: "consolidar_y_enviar",
      ciudadesOrigen: 1,
    });
    assert.equal(d.payoutCents, d.subtotalCents - d.commissionCents - d.processingCents);
    assert.ok(d.payoutCents < d.subtotalCents);
  });

  it("nunca deja a los vendedores debiendo dinero", () => {
    // Una carta de tres pesos no cubre la cuota fija de la terminal, y no es un
    // caso inventado: la mediana del catálogo de una tienda chica ronda los seis
    // pesos. El pago es cero, no negativo.
    const d = desglosar({
      subtotalCents: 300,
      entrega: "recoger_en_cada_tienda",
      ciudadesOrigen: 1,
    });
    assert.equal(d.payoutCents, 0);
  });

  it("una comanda vacía no cobra la cuota fija", () => {
    const d = desglosar({ subtotalCents: 0, entrega: "recoger_en_cada_tienda", ciudadesOrigen: 1 });
    assert.equal(d.totalCents, 0);
    assert.equal(d.processingCents, 0);
  });
});
