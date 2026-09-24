import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { esCorreoAdmin } from "@/lib/auth/session";

describe("esCorreoAdmin", () => {
  it("compara sin importar mayúsculas ni espacios", () => {
    process.env.ADMIN_EMAILS = " Pepe@Ejemplo.com , otro@ejemplo.com ";
    assert.equal(esCorreoAdmin("pepe@ejemplo.com"), true);
    assert.equal(esCorreoAdmin(" OTRO@ejemplo.com "), true);
  });

  it("nadie es admin si la lista está vacía", () => {
    // La alternativa era "el primero que entre": eso convierte a cualquiera que
    // descubra la URL antes que nosotros en dueño de la plataforma.
    process.env.ADMIN_EMAILS = "";
    assert.equal(esCorreoAdmin("pepe@ejemplo.com"), false);
    delete process.env.ADMIN_EMAILS;
    assert.equal(esCorreoAdmin("pepe@ejemplo.com"), false);
  });

  it("no acepta un correo que sólo se parece", () => {
    process.env.ADMIN_EMAILS = "pepe@ejemplo.com";
    assert.equal(esCorreoAdmin("pepe@ejemplo.com.mx"), false);
    assert.equal(esCorreoAdmin("nopepe@ejemplo.com"), false);
    delete process.env.ADMIN_EMAILS;
  });
});
