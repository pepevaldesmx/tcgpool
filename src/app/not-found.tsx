import Link from "next/link";
import SearchBox from "@/components/SearchBox";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">No encontramos esa carta</h1>
      <p className="mt-3 text-sm text-ink-300">
        Puede que ninguna tienda conectada la tenga indexada todavía.
      </p>
      <div className="mt-8">
        <SearchBox size="lg" />
      </div>
      <Link href="/" className="mt-6 inline-block text-sm text-brand-400 hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}
