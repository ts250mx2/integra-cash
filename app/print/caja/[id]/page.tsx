import type { RowDataPacket } from 'mysql2';
import { notFound, redirect } from 'next/navigation';
import PrintButton from '@/components/PrintButton';
import { getUser } from '@/lib/auth';
import pool from '@/lib/db';
import '../../print.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Corte de caja · Integra Cash' };

interface CashRow extends RowDataPacket {
  IdCaja: number;
  FechaApertura: string;
  FechaCierre: string | null;
  FondoInicial: number;
  SaldoEsperado: number;
  EfectivoContado: number | null;
  Diferencia: number | null;
  Status: string;
  Usuario: string;
  Sucursal: string;
}
interface MovementRow extends RowDataPacket {
  IdMovimiento: number;
  Tipo: string;
  Concepto: string;
  Importe: number;
  Referencia: string;
  Fecha: string;
}

const money = (value: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value));
const date = (value: string) =>
  `${new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`))}${value.length >= 16 ? ` · ${value.slice(11, 16)} h` : ''}`;

export default async function CashPrintPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) redirect('/login');
  const { id } = await params;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) notFound();
  const [rows] = await pool.execute<CashRow[]>(
    `
    SELECT c.IdCaja, c.FechaApertura, c.FechaCierre, c.FondoInicial, c.SaldoEsperado,
      c.EfectivoContado, c.Diferencia, c.Status, u.Usuario, s.Nombre AS Sucursal
    FROM tblCajas c
    JOIN tblUsuarios u ON u.IdUsuario = c.IdUsuario
    JOIN tblSucursales s ON s.IdSucursal = c.IdSucursal
    WHERE c.IdCaja = ? LIMIT 1`,
    [Number(id)],
  );
  const cash = rows[0];
  if (!cash) notFound();
  const [[movements], [settings]] = await Promise.all([
    pool.execute<MovementRow[]>(
      'SELECT IdMovimiento, Tipo, Concepto, Importe, Referencia, Fecha FROM tblMovimientosCaja WHERE IdCaja = ? ORDER BY Fecha ASC, IdMovimiento ASC',
      [Number(id)],
    ),
    pool.execute<RowDataPacket[]>('SELECT Valor FROM tblConfiguracion WHERE Clave = ? LIMIT 1', [
      'nombreNegocio',
    ]),
  ]);
  const business = String(settings[0]?.Valor || 'Integra Cash');
  const receipt = `CAJ-${String(cash.IdCaja).padStart(6, '0')}`;
  const totalIn = movements
    .filter((m) => m.Tipo === 'entrada')
    .reduce((sum, m) => sum + Number(m.Importe), 0);
  const totalOut = movements
    .filter((m) => m.Tipo === 'salida')
    .reduce((sum, m) => sum + Number(m.Importe), 0);

  return (
    <main className="print-page">
      <PrintButton backHref="/?view=caja" />
      <article className="print-sheet" aria-label={`Reporte de caja ${receipt}`}>
        <header className="print-header">
          <div>
            <div className="print-brand">
              <span className="print-brand-mark">i</span>
              {business}
            </div>
            <p className="print-tagline">Control de efectivo</p>
          </div>
          <div className="print-header-meta">
            <strong>Sucursal {cash.Sucursal}</strong>Moneda: pesos mexicanos (MXN)
            <br />
            <span className="print-status">Caja {cash.Status}</span>
          </div>
        </header>
        <div className="print-heading">
          <div>
            <p className="print-eyebrow">Tesorería · Registro interno</p>
            <h1>{cash.Status === 'cerrada' ? 'Corte de caja' : 'Resumen de caja'}</h1>
          </div>
          <div className="print-folio">
            <small>Folio de caja</small>
            {receipt}
          </div>
        </div>
        <section className="print-section">
          <h2 className="print-section-title">Datos del turno</h2>
          <div className="print-grid">
            <dl className="print-field">
              <dt>Responsable de apertura</dt>
              <dd>{cash.Usuario}</dd>
            </dl>
            <dl className="print-field">
              <dt>Fondo inicial</dt>
              <dd>{money(cash.FondoInicial)}</dd>
            </dl>
            <dl className="print-field">
              <dt>Apertura</dt>
              <dd>{date(cash.FechaApertura)}</dd>
            </dl>
            <dl className="print-field">
              <dt>Cierre</dt>
              <dd>{cash.FechaCierre ? date(cash.FechaCierre) : 'Turno en curso'}</dd>
            </dl>
          </div>
        </section>
        <div className="print-summary">
          <dl className="print-field">
            <dt>Efectivo esperado</dt>
            <dd>{money(cash.SaldoEsperado)}</dd>
          </dl>
          <dl className="print-field">
            <dt>Efectivo contado</dt>
            <dd>{cash.EfectivoContado === null ? 'Pendiente' : money(cash.EfectivoContado)}</dd>
          </dl>
          <dl className="print-field">
            <dt>Diferencia</dt>
            <dd>
              {cash.Diferencia === null ? 'Pendiente' : money(cash.Diferencia)}
              <small>
                {cash.Diferencia === null
                  ? 'Disponible al cerrar caja'
                  : Number(cash.Diferencia) === 0
                    ? 'Caja cuadrada'
                    : Number(cash.Diferencia) > 0
                      ? 'Sobrante de efectivo'
                      : 'Faltante de efectivo'}
              </small>
            </dd>
          </dl>
        </div>
        <section className="print-section">
          <h2 className="print-section-title">Conciliación de efectivo</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="print-numeric">Importe</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Fondo de apertura</td>
                <td className="print-numeric">{money(cash.FondoInicial)}</td>
              </tr>
              <tr>
                <td>Entradas de efectivo</td>
                <td className="print-numeric">{money(totalIn)}</td>
              </tr>
              <tr>
                <td>Salidas de efectivo</td>
                <td className="print-numeric">−{money(totalOut)}</td>
              </tr>
            </tbody>
          </table>
          <div className="print-total">
            <span>Saldo esperado registrado</span>
            <strong>{money(cash.SaldoEsperado)}</strong>
          </div>
          <p className="print-note">
            El control de caja corresponde a movimientos de efectivo. Los pagos con tarjeta y
            transferencia no aumentan el efectivo disponible.
          </p>
        </section>
        <section className="print-section print-section-flow">
          <h2 className="print-section-title">Movimientos del turno · {movements.length}</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>Fecha / hora</th>
                <th>Concepto / referencia</th>
                <th>Tipo</th>
                <th className="print-numeric">Importe</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.IdMovimiento}>
                  <td>{date(movement.Fecha)}</td>
                  <td>
                    {movement.Concepto}
                    {movement.Referencia && (
                      <>
                        <br />
                        <span>{movement.Referencia}</span>
                      </>
                    )}
                  </td>
                  <td>{movement.Tipo === 'entrada' ? 'Entrada' : 'Salida'}</td>
                  <td className="print-numeric">
                    {movement.Tipo === 'salida' ? '−' : '+'}
                    {money(movement.Importe)}
                  </td>
                </tr>
              ))}
              {!movements.length && (
                <tr>
                  <td colSpan={4} className="print-empty">
                    No se registraron movimientos en este turno.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        {cash.Status !== 'cerrada' && (
          <p className="print-notice">
            Resumen de un turno en curso. El efectivo contado y la diferencia final estarán
            disponibles después del cierre.
          </p>
        )}
        <div className="print-signatures">
          <div className="print-signature">
            {cash.Usuario}
            <small>Responsable de caja</small>
          </div>
          <div className="print-signature">
            Nombre y firma<small>Revisó</small>
          </div>
        </div>
        <footer className="print-footer">
          <span>
            {business} · {cash.Sucursal}
          </span>
          <span>Documento de control interno · {receipt}</span>
        </footer>
      </article>
    </main>
  );
}
