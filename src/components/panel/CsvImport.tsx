"use client";

import { useState } from "react";
import { importCsvAction, type ResumenImportacion } from "@/app/tienda/[slug]/actions";

/**
 * Importar el inventario de un archivo.
 *
 * Siempre en dos tiempos: primero se lee y se enseña qué entendimos, y sólo
 * después se escribe. Importar a ciegas mil renglones y avisar del resultado
 * es como una tienda pierde la confianza en la herramienta de un solo golpe.
 */
export default function CsvImport({ token, slug }: { token: string; slug: string }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function correr(ensayo: boolean) {
    if (!archivo) return;
    setTrabajando(true);
    try {
      const fd = new FormData();
      fd.set("token", token);
      fd.set("slug", slug);
      fd.set("archivo", archivo);
      fd.set("ensayo", ensayo ? "1" : "0");
      setResumen(await importCsvAction(fd));
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="mt-4 rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          onChange={(e) => {
            setArchivo(e.target.files?.[0] ?? null);
            setResumen(null);
          }}
          className="max-w-full text-[14px] text-muted file:mr-3 file:rounded-pill file:border file:border-line file:bg-paper file:px-4 file:py-1.5 file:text-[13px] file:font-semibold file:text-ink"
        />
        <button
          type="button"
          disabled={!archivo || trabajando}
          onClick={() => correr(true)}
          className="rounded-pill border border-line bg-surface px-5 py-2 text-[14px] font-semibold text-muted shadow-card transition hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {trabajando ? "Leyendo…" : "Ver qué entendimos"}
        </button>
      </div>

      <p className="mt-2 text-[13px] text-muted">
        Hacen falta al menos dos columnas: <strong className="text-ink">nombre</strong> y{" "}
        <strong className="text-ink">precio</strong>. Si traes set, número, condición, idioma,
        acabado o cantidad, también los leemos. Nada se guarda hasta que lo confirmes.
      </p>

      {resumen && (
        <div
          className={`mt-4 rounded-card border p-4 ${
            resumen.ok ? "border-line bg-paper" : "border-warn bg-paper"
          }`}
        >
          <p className={`text-[15px] font-semibold ${resumen.ok ? "text-ink" : "text-warn"}`}>
            {resumen.mensaje}
          </p>

          {resumen.ok && (
            <>
              <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[14px]">
                <div>
                  <dt className="text-[12px] uppercase tracking-[0.07em] text-muted">Renglones</dt>
                  <dd className="font-semibold tnum">{resumen.total.toLocaleString("es-MX")}</dd>
                </div>
                <div>
                  <dt className="text-[12px] uppercase tracking-[0.07em] text-muted">
                    Cartas reconocidas
                  </dt>
                  <dd className="font-semibold tnum text-accent">
                    {resumen.reconocidas.toLocaleString("es-MX")}
                  </dd>
                </div>
                {resumen.descartadas > 0 && (
                  <div>
                    <dt className="text-[12px] uppercase tracking-[0.07em] text-muted">
                      Sin precio legible
                    </dt>
                    <dd className="font-semibold tnum">{resumen.descartadas}</dd>
                  </div>
                )}
                {!resumen.ensayo && resumen.suplantadas > 0 && (
                  <div>
                    <dt className="text-[12px] uppercase tracking-[0.07em] text-muted">
                      Cedieron del feed
                    </dt>
                    <dd className="font-semibold tnum">{resumen.suplantadas}</dd>
                  </div>
                )}
              </dl>

              {resumen.desconocidos.length > 0 && (
                <div className="mt-3">
                  <p className="text-[13px] font-semibold text-warn">
                    No reconocimos estos nombres y NO se van a importar:
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {resumen.desconocidos.map((d) => (
                      <li
                        key={d.nombre}
                        className="rounded-pill border border-line bg-surface px-2.5 py-0.5 text-[12px] text-muted"
                      >
                        {d.nombre}
                        {d.veces > 1 && <span className="tnum"> ×{d.veces}</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[12px] text-muted">
                    Casi siempre son fichas, art cards o sellado. Si alguna es una carta de
                    verdad, dinos cómo viene escrita.
                  </p>
                </div>
              )}

              {resumen.ensayo && resumen.reconocidas > 0 && (
                <button
                  type="button"
                  disabled={trabajando}
                  onClick={() => correr(false)}
                  className="mt-4 rounded-pill border border-accent bg-accent px-5 py-2 text-[14px] font-semibold text-accent-ink shadow-card disabled:opacity-40"
                >
                  {trabajando
                    ? "Importando…"
                    : `Importar ${resumen.reconocidas.toLocaleString("es-MX")} cartas`}
                </button>
              )}

              {!resumen.ensayo && (
                <p className="mt-3 text-[14px] text-ink">
                  Se guardaron{" "}
                  <strong className="tnum">{resumen.guardadas.toLocaleString("es-MX")}</strong>{" "}
                  listados. Lo que subiste manda: la importación de tu tienda en línea no los
                  pisa.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
