'use client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid place-items-center py-24 text-center">
      <h1 className="text-3xl font-bold uppercase">Algo salió mal</h1>
      <p className="mt-2 max-w-md text-muted">
        No pudimos cargar esta sección. Si el problema persiste, verifica que la API esté en ejecución.
      </p>
      {error.digest && <p className="mt-1 text-xs text-muted">Código: {error.digest}</p>}
      <button type="button" onClick={reset} className="btn-primary mt-6">
        Reintentar
      </button>
    </div>
  );
}
