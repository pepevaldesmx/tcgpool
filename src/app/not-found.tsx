import Link from "next/link";
import SearchBox from "@/components/SearchBox";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">
        No encontramos esa carta
      </h1>
      <p className="mt-3 text-sm text-muted">
        Puede que ninguna tienda conectada la tenga indexada todavía.
      </p>
      <div className="mt-8 text-left">
        <SearchBox size="lg" />
      </div>
      <Link href="/" className="mt-6 inline-block text-sm text-accent hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}
