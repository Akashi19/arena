'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Vuelve a consultar el pago cada 3 s (hasta 2 minutos) mientras llega el webhook del proveedor. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      if (++n > 40) return clearInterval(t);
      router.refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
