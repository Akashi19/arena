'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-ghost px-3 py-1.5 text-sm">
      <Printer className="size-4" /> Imprimir o guardar PDF
    </button>
  );
}
