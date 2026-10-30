import Link from 'next/link';
export default function NotFound() { return <main className="mx-auto max-w-lg p-10"><h1 className="text-3xl font-semibold">Página no encontrada</h1><p className="my-5 text-muted-foreground">Revisa la dirección o vuelve a tus negocios.</p><Link href="/app" className="text-primary underline">Volver a Zenvik</Link></main>; }
