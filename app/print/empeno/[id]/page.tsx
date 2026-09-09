import type { RowDataPacket } from 'mysql2';
import { notFound, redirect } from 'next/navigation';
import PrintButton from '@/components/PrintButton';
import { getUser } from '@/lib/auth';
import { daysBetween, quoteInterest, roundMoney, today } from '@/lib/business';
import pool from '@/lib/db';
import '../../print.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Boleta de empeño · Integra Cash' };

interface PawnRow extends RowDataPacket {
  Folio: string;
  Capital: number;
  SaldoCapital: number;
  CapitalPeriodo: number;
  TasaInteres: number;
  PlazoDias: number;
  FechaAlta: string;
  FechaVencimiento: string;
  Status: string;
  Notas: string | null;
  Refrendos: number;
  Cliente: string;
  Telefono: string;
  Identificacion: string;
  Direccion: string;
  Descripcion: string;
  Marca: string;
  Modelo: string;
  Serie: string;
  Condicion: string;
  Peso: number | null;
  Quilataje: string | null;
  Avaluo: number;
  Ubicacion: string;
  Categoria: string;
  Valuador: string;
  Sucursal: string;
}

const money = (value: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value));
const date = (value: string) =>
  new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
const present = (value: string | number | null) =>
  value === null || value === '' ? 'No registrado' : value;
const statusNames: Record<string, string> = {
  vigente: 'Vigente',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  desempenado: 'Desempeñado',
  adjudicado: 'Adjudicado',
};

export default async function PawnPrintPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) redirect('/login');
  const { id } = await params;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) notFound();
  const [rows] = await pool.execute<PawnRow[]>(
    `
    SELECT e.Folio, e.Capital, e.SaldoCapital, e.CapitalPeriodo, e.TasaInteres, e.PlazoDias,
      e.FechaAlta, e.FechaVencimiento, e.Status, e.Notas, e.Refrendos,
      c.Nombre AS Cliente, c.Telefono, c.Identificacion, c.Direccion,
      a.Descripcion, a.Marca, a.Modelo, a.Serie, a.Condicion, a.Peso, a.Quilataje,
      a.Avaluo, a.Ubicacion, cat.Categoria, u.Usuario AS Valuador, s.Nombre AS Sucursal
    FROM tblEmpenos e
    JOIN tblClientes c ON c.IdCliente = e.IdCliente
    JOIN tblArticulos a ON a.IdArticulo = e.IdArticulo
    JOIN tblCategorias cat ON cat.IdCategoria = a.IdCategoria
    JOIN tblUsuarios u ON u.IdUsuario = e.IdUsuario
    JOIN tblSucursales s ON s.IdSucursal = e.IdSucursal
    WHERE e.IdEmpeno = ? LIMIT 1`,
    [Number(id)],
  );
  const loan = rows[0];
  if (!loan) notFound();
  const [settings] = await pool.execute<RowDataPacket[]>(
    'SELECT Valor FROM tblConfiguracion WHERE Clave = ? LIMIT 1',
    ['nombreNegocio'],
  );
  const business = String(settings[0]?.Valor || 'Integra Cash');
  const asOf = today();
  const active = loan.Status === 'vigente';
  const remainingDays = daysBetween(asOf, loan.FechaVencimiento);
  const status = active
    ? remainingDays < 0
      ? 'vencido'
      : remainingDays <= 7
        ? 'por_vencer'
        : 'vigente'
    : loan.Status;
  const interest = active
    ? quoteInterest(
        Number(loan.CapitalPeriodo),
        Number(loan.TasaInteres),
        Number(loan.PlazoDias),
        loan.FechaVencimiento,
        asOf,
      )
    : 0;
  const total = active ? roundMoney(Number(loan.SaldoCapital) + interest) : 0;

  return (
    <main className="print-page">
      <PrintButton backHref="/?view=empenos" />
      <article className="print-sheet" aria-label={`Boleta de empeño ${loan.Folio}`}>
        <header className="print-header">
          <div>
            <div className="print-brand">
              <span className="print-brand-mark">i</span>
              {business}
            </div>
            <p className="print-tagline">Casa de empeños</p>
          </div>
          <div className="print-header-meta">
            <strong>Sucursal {loan.Sucursal}</strong>Operación del {date(loan.FechaAlta)}
            <br />
            Moneda: pesos mexicanos (MXN)
          </div>
        </header>
        <div className="print-heading">
          <div>
            <p className="print-eyebrow">Comprobante de operación</p>
            <h1>Boleta de empeño</h1>
          </div>
          <div className="print-folio">
            <small>Folio de empeño</small>
            {loan.Folio}
          </div>
        </div>
        <section className="print-section">
          <h2 className="print-section-title">01 / Datos del cliente</h2>
          <div className="print-grid">
            <dl className="print-field">
              <dt>Nombre completo</dt>
              <dd>{loan.Cliente}</dd>
            </dl>
            <dl className="print-field">
              <dt>Identificación</dt>
              <dd>{present(loan.Identificacion)}</dd>
            </dl>
            <dl className="print-field">
              <dt>Teléfono</dt>
              <dd>{present(loan.Telefono)}</dd>
            </dl>
            <dl className="print-field">
              <dt>Domicilio</dt>
              <dd>{present(loan.Direccion)}</dd>
            </dl>
          </div>
        </section>
        <section className="print-section">
          <h2 className="print-section-title">02 / Garantía recibida</h2>
          <div className="print-grid print-grid-three">
            <dl className="print-field print-field-wide">
              <dt>Descripción del artículo</dt>
              <dd>{loan.Descripcion}</dd>
            </dl>
            <dl className="print-field">
              <dt>Categoría</dt>
              <dd>{loan.Categoria}</dd>
            </dl>
            <dl className="print-field">
              <dt>Marca / modelo</dt>
              <dd>{[loan.Marca, loan.Modelo].filter(Boolean).join(' / ') || 'No registrado'}</dd>
            </dl>
            <dl className="print-field">
              <dt>Número de serie</dt>
              <dd>{present(loan.Serie)}</dd>
            </dl>
            <dl className="print-field">
              <dt>Condición</dt>
              <dd>{present(loan.Condicion)}</dd>
            </dl>
            <dl className="print-field">
              <dt>Avalúo</dt>
              <dd>{money(loan.Avaluo)}</dd>
            </dl>
            <dl className="print-field">
              <dt>Ubicación de resguardo</dt>
              <dd>{present(loan.Ubicacion)}</dd>
            </dl>
            {(loan.Peso !== null || loan.Quilataje) && (
              <dl className="print-field print-field-wide">
                <dt>Peso / quilataje</dt>
                <dd>
                  {[loan.Peso !== null ? `${loan.Peso} g` : '', loan.Quilataje]
                    .filter(Boolean)
                    .join(' / ')}
                </dd>
              </dl>
            )}
          </div>
        </section>
        <div className="print-summary">
          <dl className="print-field">
            <dt>Capital entregado</dt>
            <dd>
              {money(loan.Capital)}
              <small>Importe original del préstamo</small>
            </dd>
          </dl>
          <dl className="print-field">
            <dt>Tasa mensual</dt>
            <dd>
              {Number(loan.TasaInteres).toLocaleString('es-MX')}%
              <small>Interés simple por cada 30 días</small>
            </dd>
          </dl>
          <dl className="print-field">
            <dt>Vencimiento actual</dt>
            <dd style={{ fontSize: 17 }}>
              {date(loan.FechaVencimiento)}
              <small>Plazo: {loan.PlazoDias} días</small>
            </dd>
          </dl>
        </div>
        <section className="print-section">
          <h2 className="print-section-title">03 / Estado de la operación</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="print-numeric">Importe</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  {loan.Status === 'adjudicado'
                    ? 'Capital registrado al adjudicar'
                    : 'Capital pendiente'}
                </td>
                <td className="print-numeric">{money(loan.SaldoCapital)}</td>
              </tr>
              <tr>
                <td>
                  Interés del periodo de {loan.PlazoDias} días
                  {active && remainingDays < 0
                    ? ` y ${Math.abs(remainingDays)} días de atraso`
                    : ''}
                </td>
                <td className="print-numeric">{money(interest)}</td>
              </tr>
            </tbody>
          </table>
          <div className="print-total">
            <span>{active ? `Liquidación al ${date(asOf)}` : 'Operación finalizada'}</span>
            <strong>{active ? money(total) : statusNames[status] || status}</strong>
          </div>
          <p className="print-note">
            Estado: {statusNames[status] || status}. Refrendos registrados: {loan.Refrendos}. Los
            saldos y el vencimiento reflejan la información actual de la operación. El interés
            considera el plazo completo, incluso al pagar anticipadamente, y se calcula diariamente
            en caso de atraso, sin capitalización.
          </p>
          {loan.Notas && (
            <p className="print-note">
              <strong>Observaciones:</strong> {loan.Notas}
            </p>
          )}
        </section>
        <p className="print-notice">
          Comprobante de operación. Las condiciones contractuales aplicables deben entregarse por
          separado.
        </p>
        <div className="print-signatures">
          <div className="print-signature">
            {loan.Cliente}
            <small>Nombre y firma del cliente</small>
          </div>
          <div className="print-signature">
            {loan.Valuador}
            <small>Nombre y firma del valuador</small>
          </div>
        </div>
        <footer className="print-footer">
          <span>
            {business} · {loan.Sucursal}
          </span>
          <span>Conserva este comprobante · {loan.Folio}</span>
        </footer>
      </article>
    </main>
  );
}
