import type { RowDataPacket } from 'mysql2';
import { notFound, redirect } from 'next/navigation';
import PrintButton from '@/components/PrintButton';
import { getUser } from '@/lib/auth';
import pool from '@/lib/db';
import '../../print.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Recibo de pago · Integra Cash' };

interface PaymentRow extends RowDataPacket {
  IdPago: number;
  Tipo: string;
  Capital: number;
  Interes: number;
  Importe: number;
  Metodo: string;
  Fecha: string;
  Referencia: string;
  Folio: string;
  Cliente: string;
  Descripcion: string;
  Usuario: string;
  Sucursal: string;
}

const money = (value: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value));
const date = (value: string) =>
  `${new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`))}${value.length >= 16 ? ` · ${value.slice(11, 16)} h` : ''}`;
const paymentTypes: Record<string, string> = {
  refrendo: 'Refrendo',
  desempeno: 'Desempeño',
  abono: 'Abono a capital',
};
const methods: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia bancaria',
  tarjeta: 'Tarjeta',
};

export default async function PaymentPrintPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) redirect('/login');
  const { id } = await params;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) notFound();
  const [rows] = await pool.execute<PaymentRow[]>(
    `
    SELECT p.IdPago, p.Tipo, p.Capital, p.Interes, p.Importe, p.Metodo, p.Fecha, p.Referencia,
      e.Folio, c.Nombre AS Cliente, a.Descripcion, u.Usuario, s.Nombre AS Sucursal
    FROM tblPagos p
    JOIN tblEmpenos e ON e.IdEmpeno = p.IdEmpeno
    JOIN tblClientes c ON c.IdCliente = e.IdCliente
    JOIN tblArticulos a ON a.IdArticulo = e.IdArticulo
    JOIN tblUsuarios u ON u.IdUsuario = p.IdUsuario
    JOIN tblSucursales s ON s.IdSucursal = e.IdSucursal
    WHERE p.IdPago = ? LIMIT 1`,
    [Number(id)],
  );
  const payment = rows[0];
  if (!payment) notFound();
  const [settings] = await pool.execute<RowDataPacket[]>(
    'SELECT Valor FROM tblConfiguracion WHERE Clave = ? LIMIT 1',
    ['nombreNegocio'],
  );
  const business = String(settings[0]?.Valor || 'Integra Cash');
  const receipt = `PAG-${String(payment.IdPago).padStart(6, '0')}`;

  return (
    <main className="print-page">
      <PrintButton backHref="/?view=empenos" />
      <article className="print-sheet" aria-label={`Recibo de pago ${receipt}`}>
        <header className="print-header">
          <div>
            <div className="print-brand">
              <span className="print-brand-mark">i</span>
              {business}
            </div>
            <p className="print-tagline">Casa de empeños</p>
          </div>
          <div className="print-header-meta">
            <strong>Sucursal {payment.Sucursal}</strong>
            {date(payment.Fecha)}
            <br />
            Moneda: pesos mexicanos (MXN)
          </div>
        </header>
        <div className="print-heading">
          <div>
            <p className="print-eyebrow">Pago registrado</p>
            <h1>Recibo de pago</h1>
          </div>
          <div className="print-folio">
            <small>Folio de recibo</small>
            {receipt}
          </div>
        </div>
        <section className="print-section">
          <h2 className="print-section-title">Datos de la operación</h2>
          <div className="print-grid">
            <dl className="print-field">
              <dt>Recibimos de</dt>
              <dd>{payment.Cliente}</dd>
            </dl>
            <dl className="print-field">
              <dt>Folio de empeño</dt>
              <dd>{payment.Folio}</dd>
            </dl>
            <dl className="print-field print-field-wide">
              <dt>Artículo en garantía</dt>
              <dd>{payment.Descripcion}</dd>
            </dl>
            <dl className="print-field">
              <dt>Tipo de pago</dt>
              <dd>{paymentTypes[payment.Tipo] || payment.Tipo}</dd>
            </dl>
            <dl className="print-field">
              <dt>Método de pago</dt>
              <dd>{methods[payment.Metodo] || payment.Metodo}</dd>
            </dl>
            <dl className="print-field">
              <dt>Referencia</dt>
              <dd>{payment.Referencia || 'Sin referencia'}</dd>
            </dl>
            <dl className="print-field">
              <dt>Atendió</dt>
              <dd>{payment.Usuario}</dd>
            </dl>
          </div>
        </section>
        <div className="print-summary">
          <dl className="print-field">
            <dt>Total recibido</dt>
            <dd>
              {money(payment.Importe)}
              <small>Pesos mexicanos</small>
            </dd>
          </dl>
          <dl className="print-field">
            <dt>Aplicado a capital</dt>
            <dd>{money(payment.Capital)}</dd>
          </dl>
          <dl className="print-field">
            <dt>Aplicado a intereses</dt>
            <dd>{money(payment.Interes)}</dd>
          </dl>
        </div>
        <section className="print-section">
          <h2 className="print-section-title">Desglose del pago</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="print-numeric">Importe</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Abono a capital del empeño {payment.Folio}</td>
                <td className="print-numeric">{money(payment.Capital)}</td>
              </tr>
              <tr>
                <td>Intereses del periodo</td>
                <td className="print-numeric">{money(payment.Interes)}</td>
              </tr>
            </tbody>
          </table>
          <div className="print-total">
            <span>Total del pago</span>
            <strong>{money(payment.Importe)}</strong>
          </div>
        </section>
        <p className="print-notice">
          Comprobante de operación. Las condiciones contractuales aplicables deben entregarse por
          separado.
        </p>
        <div className="print-signatures">
          <div className="print-signature">
            {payment.Cliente}
            <small>Nombre y firma del cliente</small>
          </div>
          <div className="print-signature">
            {payment.Usuario}
            <small>Recibió el pago</small>
          </div>
        </div>
        <footer className="print-footer">
          <span>
            {business} · {payment.Sucursal}
          </span>
          <span>Conserva este comprobante · {receipt}</span>
        </footer>
      </article>
    </main>
  );
}
