import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` abre sockets y carga módulos nativos opcionales: tiene que quedar
  // fuera del bundle para que Next no intente empaquetarlo.
  serverExternalPackages: ["pg"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cards.scryfall.io" }],
  },
};

export default nextConfig;
