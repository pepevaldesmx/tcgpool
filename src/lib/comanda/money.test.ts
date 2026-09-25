import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ENTREGAS,
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
    assert.equal(d.payoutCents, d.subtotalCents - d.commissionCents - d.processingCardsCents);
    assert.ok(d.payoutCents < d.subtotalCents);
  });

  it("la comisión de terminal del envío NO se le cobra a la tienda", () => {
    // Misma venta de cartas, con y sin envío: al vendedor le llega lo mismo.
    // Cobrarle la comisión de un envío que él no cobró le quitaría dinero por un
    // servicio que no dio.
    const sinEnvio = desglosar({
      subtotalCents: 50_000,
      entrega: "recoger_en_cada_tienda",
      ciudadesOrigen: 1,
    });
    const conEnvio = desglosar({
      subtotalCents: 50_000,
      entrega: "consolidar_y_enviar",
      ciudadesOrigen: 1,
    });
    assert.equal(conEnvio.payoutCents, sinEnvio.payoutCents);
  });

  it("las dos partes de la terminal suman exactamente lo que cobra", () => {
    // El residuo, no dos redondeos: así no se inventa ni se pierde un centavo.
    for (const subtotal of [1_337, 50_000, 99_999, 123_457]) {
      for (const entrega of ENTREGAS) {
        const d = desglosar({ subtotalCents: subtotal, entrega, ciudadesOrigen: 2 });
        assert.equal(
          d.processingCardsCents + d.processingShippingCents,
          d.processingCents,
          `${subtotal} / ${entrega}`,
        );
        // Y ninguna parte puede salir negativa: una comisión negativa sería un
        // ingreso inventado.
        assert.ok(d.processingShippingCents >= 0, `${subtotal} / ${entrega}`);
        assert.ok(d.processingCardsCents >= 0, `${subtotal} / ${entrega}`);
      }
    }
  });

  it("sin envío, toda la comisión de terminal es de las cartas", () => {
    const d = desglosar({
      subtotalCents: 50_000,
      entrega: "recoger_en_cada_tienda",
      ciudadesOrigen: 1,
    });
    assert.equal(d.processingShippingCents, 0);
    assert.equal(d.processingCardsCents, d.processingCents);
    assert.equal(d.deliveryNetCents, 0);
  });

  it("dice cuánto queda del envío para el mensajero", () => {
    const d = desglosar({
      subtotalCents: 50_000,
      entrega: "consolidar_y_recoger",
      ciudadesOrigen: 1,
    });
    assert.equal(d.deliveryNetCents, 5_000 - d.processingShippingCents);
    assert.ok(d.deliveryNetCents > 0 && d.deliveryNetCents < 5_000);
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
