/**
 * Diagnostica DATABASE_URL sin revelarla.
 *
 *   npm run db:check
 *
 * Existe porque los errores de conexión de Postgres son mudos: `28P01` dice
 * "contraseña incorrecta" tanto si te equivocaste de contraseña como si
 * copiaste la cadena directa en vez de la del pooler, o si dejaste el
 * marcador `[YOUR-PASSWORD]` sin sustituir. Esto nombra cuál de los tres es.
 *
 * Imprime host, puerto y la forma del usuario —nunca la contraseña— así que
 * se puede correr dentro de CI y leer el log sin exponer el secreto.
 */
import { closePool, connectionString, one } from "../src/lib/db";

interface Finding {
  level: "ok" | "warn" | "error";
  text: string;
}

function mask(ref: string): string {
  return ref.length <= 6 ? "…" : `${ref.slice(0, 4)}…${ref.slice(-2)}`;
}

function diagnose(raw: string): Finding[] {
  const findings: Finding[] = [];

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return [{ level: "error", text: "la cadena no es una URL válida" }];
  }

  const host = url.hostname;
  const port = url.port || "5432";
  const [user, ref] = url.username.split(".");
  const pooler = host.includes("pooler.supabase.com");
  const directo = /^db\..+\.supabase\.co$/.test(host);

  findings.push({ level: "ok", text: `host    ${host}` });
  findings.push({
    level: pooler && port === "6543" ? "ok" : "warn",
    text: `puerto  ${port}${pooler && port === "6543" ? "  (pooler en modo transacción)" : ""}`,
  });
  findings.push({
    level: "ok",
    text: `usuario ${user}${ref ? `.${mask(ref)}` : ""}`,
  });

  // El pooler de Supabase exige 'postgres.<ref>' como usuario; 'postgres' a
  // secas es la cadena directa, que sólo responde por IPv6 en el plan gratuito.
  if (directo || (!pooler && host.endsWith("supabase.co"))) {
    findings.push({
      level: "error",
      text:
        "ésta es la CADENA DIRECTA. En el plan gratuito sólo responde por IPv6, " +
        "y ni Vercel ni GitHub Actions salen por IPv6. Usa la de Transaction " +
        "pooler (host …pooler.supabase.com, puerto 6543).",
    });
  } else if (pooler && !ref) {
    findings.push({
      level: "error",
      text:
        "al usuario le falta el '.<ref-del-proyecto>' que el pooler exige: " +
        "debe verse 'postgres.abcdefghijklmnop', no 'postgres' a secas.",
    });
  }

  const pass = url.password;
  if (!pass) {
    findings.push({ level: "error", text: "la cadena no trae contraseña" });
  } else if (/YOUR[-_]?PASSWORD|^\[.*\]$/i.test(decodeURIComponent(pass))) {
    findings.push({
      level: "error",
      text: "la contraseña sigue siendo el marcador '[YOUR-PASSWORD]', sin sustituir",
    });
  } else {
    findings.push({ level: "ok", text: `clave   ${pass.length} caracteres` });
  }

  // Un '@' sin codificar parte la cadena y el host acaba siendo un pedazo de
  // la contraseña: se nota porque el host no se parece a nada de Supabase.
  const authority = raw.slice(raw.indexOf("://") + 3, raw.lastIndexOf("/"));
  if ((authority.match(/@/g)?.length ?? 0) > 1) {
    findings.push({
      level: "warn",
      text:
        "hay más de un '@' antes del host: si tu contraseña trae '@', '#', '/', " +
        "':' o '?', hay que codificarlos (@ → %40, # → %23, / → %2F).",
    });
  }

  return findings;
}

async function main() {
  const raw = connectionString();
  if (!raw) {
    console.error("✗ Falta DATABASE_URL (o POSTGRES_URL).");
    process.exit(1);
  }

  const findings = diagnose(raw);
  for (const f of findings) {
    console.log(`${f.level === "ok" ? " " : f.level === "warn" ? "⚠" : "✗"} ${f.text}`);
  }
  if (findings.some((f) => f.level === "error")) process.exit(1);

  try {
    const row = await one<{ version: string; db: string }>(
      "SELECT version() AS version, current_database() AS db",
    );
    console.log(`✓ conecta · ${row?.version.split(",")[0]} · base '${row?.db}'`);
    const trgm = await one<{ ok: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') AS ok",
    );
    console.log(
      trgm?.ok
        ? "✓ pg_trgm disponible (búsqueda difusa)"
        : "⚠ pg_trgm NO disponible: la búsqueda difusa no va a poder crearse",
    );
  } catch (err) {
    const e = err as { code?: string; message?: string };
    console.error(`✗ no conecta · ${e.code ?? ""} ${e.message ?? String(err)}`);
    if (e.code === "28P01") {
      console.error(
        "  La contraseña no es la que Supabase espera. Se resetea en " +
          "Settings → Database → Reset database password.",
      );
    }
    if (e.code === "ENOTFOUND" || e.code === "ENETUNREACH") {
      console.error("  El host no responde desde aquí. ¿Es la cadena del pooler?");
    }
    await closePool();
    process.exit(1);
  }
  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
