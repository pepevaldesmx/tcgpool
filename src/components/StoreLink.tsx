"use client";

/**
 * Link de salida a la tienda que avisa antes de irse. El clic de salida es la
 * intención de compra más cercana que podemos medir: la venta se cierra en la
 * tienda y nunca la vemos.
 */
export default function StoreLink({
  href,
  slug,
  className,
  children,
}: {
  href: string;
  slug: string;
  className?: string;
  children: React.ReactNode;
}) {
  function track() {
    const body = JSON.stringify({ slug, kind: "clickout" });
    // sendBeacon sobrevive a que la pestaña se vaya; fetch keepalive de reserva.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/eventos", new Blob([body], { type: "application/json" }));
      return;
    }
    fetch("/api/eventos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={track}
      className={className}
    >
      {children}
    </a>
  );
}
