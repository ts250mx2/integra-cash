'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowUpRight, Box, Check, LoaderCircle, X } from 'lucide-react';
import type { ChartPoint, Loan } from '@/lib/types';

export const money = (value: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value || 0);
export const date = (value: string | null, long = false) =>
  value
    ? new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-MX', {
        day: '2-digit',
        month: long ? 'long' : 'short',
        year: 'numeric',
      })
    : '—';
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    cache: 'no-store',
  });
  const data = await response
    .json()
    .catch(() => ({ error: 'No se pudo leer la respuesta del servidor.' }));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
    throw new Error(data.error || data.message || 'No se pudo completar la operación.');
  }
  return data;
}
export const send = <T,>(path: string, body: unknown, method = 'POST') =>
  api<T>(path, { method, body: JSON.stringify(body) });
export function Empty({
  title = 'Todavía no hay registros',
  text = 'Tus operaciones aparecerán aquí.',
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Box size={25} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Spinner() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={25} />
      <span>Cargando tu operación…</span>
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  const names: Record<string, string> = {
    vigente: 'Vigente',
    por_vencer: 'Por vencer',
    vencido: 'Vencido',
    desempenado: 'Desempeñado',
    adjudicado: 'Adjudicado',
    resguardo: 'En resguardo',
    venta: 'En venta',
    vendido: 'Vendido',
    entregado: 'Entregado',
    abierta: 'Abierta',
    cerrada: 'Cerrada',
  };
  return (
    <span className={`badge ${status}`}>
      <i />
      {names[status] || status}
    </span>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  close,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="modal-head">
        <div>
          <span className="eyebrow">INTEGRA CASH</span>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-button" aria-label="Cerrar ventana" onClick={close}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Notice({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <div className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      {!error && <Check size={17} />}
      <span>{children}</span>
    </div>
  );
}
export function LoanTable({ loans, onSelect }: { loans: Loan[]; onSelect: (loan: Loan) => void }) {
  return !loans.length ? (
    <Empty
      title="Tu próxima operación empieza aquí"
      text="Registra un empeño para comenzar a construir tu cartera."
    />
  ) : (
    <>
      <div className="loan-mobile-list">
        {loans.map((l) => (
          <button
            key={l.id}
            onClick={() => onSelect(l)}
            className="loan-mobile-card"
            aria-label={`Ver boleta ${l.folio}`}
          >
            <span className="loan-mobile-top">
              <b>{l.folio}</b>
              <Badge status={l.status} />
            </span>
            <strong>{l.articulo}</strong>
            <span className="loan-mobile-client">{l.cliente}</span>
            <span className="loan-mobile-bottom">
              <span>
                Capital pendiente<b>{money(l.saldoCapital)}</b>
              </span>
              <span>
                Vencimiento<b>{date(l.fechaVencimiento)}</b>
              </span>
              <ArrowUpRight size={18} />
            </span>
          </button>
        ))}
      </div>
      <div className="table-wrap loan-desktop-table">
        <table>
          <thead>
            <tr>
              <th>Boleta / cliente</th>
              <th>Garantía</th>
              <th>Capital pendiente</th>
              <th>Vencimiento</th>
              <th>Estado</th>
              <th>
                <span className="sr-only">Abrir</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => (
              <tr key={l.id}>
                <td>
                  <button className="table-link" onClick={() => onSelect(l)}>
                    {l.folio}
                  </button>
                  <span className="cell-sub">{l.cliente}</span>
                </td>
                <td>
                  <b className="cell-title">{l.articulo}</b>
                  <span className="cell-sub">{l.categoria}</span>
                </td>
                <td className="amount">{money(l.saldoCapital)}</td>
                <td>
                  {date(l.fechaVencimiento)}
                  <span className={`cell-sub ${l.diasRestantes < 0 ? 'text-danger' : ''}`}>
                    {['desempenado', 'adjudicado'].includes(l.status)
                      ? 'Operación finalizada'
                      : l.diasRestantes < 0
                        ? `${Math.abs(l.diasRestantes)} días de atraso`
                        : l.diasRestantes === 0
                          ? 'Vence hoy'
                          : `En ${l.diasRestantes} días`}
                  </span>
                </td>
                <td>
                  <Badge status={l.status} />
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Ver boleta ${l.folio}`}
                    onClick={() => onSelect(l)}
                  >
                    <ArrowUpRight size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
export function Chart({ points }: { points: ChartPoint[] }) {
  const max = Math.max(...points.flatMap((p) => [p.prestado, p.recuperado]), 1);
  const has = points.some((p) => p.prestado || p.recuperado);
  return (
    <div className="chart">
      <div className="chart-y">
        <span>{money(max)}</span>
        <span>{money(max / 2)}</span>
        <span>$0</span>
      </div>
      <div className="chart-body">
        <div className="chart-grid" />
        <div className="chart-bars">
          {points.map((p, i) => (
            <div
              className="chart-column"
              key={i}
              title={`${p.label}: colocado ${money(p.prestado)}, cobrado ${money(p.recuperado)}`}
            >
              <div className="bar-pair">
                <i style={{ height: `${(p.prestado / max) * 100}%` }} />
                <i style={{ height: `${(p.recuperado / max) * 100}%` }} />
              </div>
              <span>{p.label}</span>
            </div>
          ))}
        </div>
        {!has && <div className="chart-empty">El movimiento de tu cartera se verá aquí</div>}
      </div>
    </div>
  );
}
export function downloadCSV(name: string, rows: (string | number)[][]) {
  const csv =
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value);
            if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(','),
      )
      .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
