'use client';

import Link from 'next/link';

export default function PrintButton({ backHref = '/' }: { backHref?: string }) {
  return (
    <nav className="print-toolbar" aria-label="Acciones del comprobante">
      <Link className="print-back" href={backHref}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m14 6-6 6 6 6M8 12h13" />
        </svg>
        Regresar
      </Link>
      <span className="print-toolbar-hint">Listo para imprimir o guardar como PDF</span>
      <button className="print-action" type="button" onClick={() => window.print()}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M7 8V3h10v5M7 17H4V8h16v9h-3M7 14h10v7H7zM16 11h1" />
        </svg>
        Imprimir comprobante
      </button>
    </nav>
  );
}
