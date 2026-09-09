'use client';
import { useState, type FormEvent } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Check,
  CircleDollarSign,
  Download,
  LockKeyhole,
  Plus,
  Printer,
  Save,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import type { BusinessConfig, CashData, InventoryItem, ReportData } from '@/lib/types';
import { Badge, Chart, date, downloadCSV, Empty, Modal, money, Notice, send } from './ui';

export function CashPanel({
  data,
  reload,
  notify,
}: {
  data: CashData;
  reload: () => void;
  notify: (message: string) => void;
}) {
  const [mode, setMode] = useState<'abrir' | 'cerrar' | 'movimiento' | ''>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [counted, setCounted] = useState('');
  const [expectedCashId, setExpectedCashId] = useState<number | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await send('caja', {
        ...form,
        accion: mode,
        cajaIdEsperada: expectedCashId,
        fondoInicial: Number(form.fondoInicial || 0),
        efectivoContado: Number(form.efectivoContado || 0),
        importe: Number(form.importe || 0),
      });
      notify(
        mode === 'abrir'
          ? 'Caja abierta. Ya puedes operar.'
          : mode === 'cerrar'
            ? 'Corte de caja registrado.'
            : 'Movimiento registrado.',
      );
      setMode('');
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const incoming = data.movimientos
    .filter((m) => m.tipo === 'entrada')
    .reduce((a, m) => a + m.importe, 0);
  const outgoing = data.movimientos
    .filter((m) => m.tipo === 'salida')
    .reduce((a, m) => a + m.importe, 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CADA PESO, EN SU LUGAR</span>
          <h1>
            Control de caja<span className="teal">.</span>
          </h1>
          <p>Entradas, salidas y un cierre sin sorpresas.</p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setError('');
            setExpectedCashId(data.caja?.id ?? null);
            setMode(data.caja ? 'movimiento' : 'abrir');
          }}
        >
          {data.caja ? <Plus size={17} /> : <Wallet size={17} />}
          {data.caja ? 'Registrar movimiento' : 'Abrir caja'}
        </button>
      </div>
      <div className="cash-layout">
        <section className="cash-balance">
          <div>
            <span className="eyebrow">EFECTIVO DISPONIBLE</span>
            <Badge status={data.caja ? 'abierta' : 'cerrada'} />
          </div>
          <strong>{money(data.caja?.saldoEsperado || 0)}</strong>
          <p>
            {data.caja
              ? `Abierta el ${date(data.caja.fechaApertura)} · Turno #${data.caja.id}`
              : 'Comienza un turno para registrar operaciones.'}
          </p>
          <div className="cash-balance-bottom">
            <span>
              <ShieldCheck size={17} /> Fondo inicial <b>{money(data.caja?.fondoInicial || 0)}</b>
            </span>
            {data.caja && (
              <button
                onClick={() => {
                  setError('');
                  setCounted('');
                  setExpectedCashId(data.caja?.id ?? null);
                  setMode('cerrar');
                }}
              >
                Cerrar caja
                <ArrowUpRight size={16} />
              </button>
            )}
          </div>
        </section>
        <div className="cash-totals">
          <div className="panel">
            <span className="metric-icon mint">
              <ArrowDownLeft size={20} />
            </span>
            <span>
              Entradas del turno<strong>{money(incoming)}</strong>
            </span>
          </div>
          <div className="panel">
            <span className="metric-icon gold">
              <ArrowUpRight size={20} />
            </span>
            <span>
              Salidas del turno<strong>{money(outgoing)}</strong>
            </span>
          </div>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Movimientos del turno</h2>
            <p>Los préstamos y cobros en efectivo se registran automáticamente.</p>
          </div>
          <button
            className="text-button"
            onClick={() =>
              downloadCSV('movimientos-caja.csv', [
                ['Fecha', 'Tipo', 'Concepto', 'Importe'],
                ...data.movimientos.map((m) => [m.fecha, m.tipo, m.concepto, m.importe]),
              ])
            }
          >
            <Download size={16} />
            Exportar
          </button>
        </div>
        {data.movimientos.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Movimiento</th>
                  <th>Concepto</th>
                  <th>Fecha</th>
                  <th>Referencia</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                {data.movimientos.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className={`movement-type ${m.tipo}`}>
                        {m.tipo === 'entrada' ? (
                          <ArrowDownLeft size={15} />
                        ) : (
                          <ArrowUpRight size={15} />
                        )}
                        {m.tipo === 'entrada' ? 'Entrada' : 'Salida'}
                      </span>
                    </td>
                    <td>
                      <b>{m.concepto}</b>
                    </td>
                    <td>{date(m.fecha)}</td>
                    <td className="muted">{m.referencia || '—'}</td>
                    <td className={`amount ${m.tipo === 'entrada' ? 'teal' : ''}`}>
                      {m.tipo === 'entrada' ? '+' : '−'}
                      {money(m.importe)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={data.caja ? 'Caja abierta, todo listo' : 'Abre las puertas a un nuevo día'}
            text={
              data.caja
                ? 'Los movimientos de este turno aparecerán aquí.'
                : 'Define el fondo inicial y comienza a atender a tus clientes.'
            }
          />
        )}
      </section>
      <section className="panel spaced">
        <div className="panel-heading">
          <div>
            <h2>Cortes anteriores</h2>
            <p>El historial de tus cierres y diferencias.</p>
          </div>
        </div>
        {data.historial.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Turno</th>
                  <th>Apertura</th>
                  <th>Cierre</th>
                  <th>Esperado</th>
                  <th>Contado</th>
                  <th>Diferencia</th>
                  <th>Corte</th>
                </tr>
              </thead>
              <tbody>
                {data.historial.map((c) => (
                  <tr key={c.id}>
                    <td>#{c.id}</td>
                    <td>{date(c.fechaApertura)}</td>
                    <td>{date(c.fechaCierre)}</td>
                    <td className="amount">{money(c.saldoEsperado)}</td>
                    <td className="amount">{money(c.efectivoContado || 0)}</td>
                    <td className={`amount ${c.diferencia ? 'text-danger' : 'teal'}`}>
                      {money(c.diferencia || 0)}
                    </td>
                    <td>
                      <a
                        className="icon-button"
                        href={`/print/caja/${c.id}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Imprimir corte ${c.id}`}
                      >
                        <Printer size={16} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="inline-empty">Aquí podrás consultar cada corte al terminar un turno.</div>
        )}
      </section>
      {mode && (
        <Modal
          title={
            mode === 'abrir'
              ? 'Un nuevo turno comienza'
              : mode === 'cerrar'
                ? 'Cierre de caja'
                : 'Registrar movimiento'
          }
          subtitle={
            mode === 'cerrar'
              ? 'Cuenta el efectivo físico y registra el importe real.'
              : 'Cada movimiento queda registrado en tu historial.'
          }
          close={() => !busy && setMode('')}
        >
          <form onSubmit={submit} className="modal-body">
            {mode === 'abrir' && (
              <label>
                Fondo inicial (MXN)
                <input
                  name="fondoInicial"
                  type="number"
                  required
                  min="0"
                  max="99999999"
                  step="0.01"
                  placeholder="0.00"
                />
              </label>
            )}
            {mode === 'cerrar' && (
              <>
                <div className="quote">
                  <div>
                    <span>Efectivo esperado</span>
                    <b>{money(data.caja?.saldoEsperado || 0)}</b>
                  </div>
                </div>
                <label>
                  Efectivo contado (MXN)
                  <input
                    name="efectivoContado"
                    type="number"
                    required
                    min="0"
                    max="99999999"
                    step="0.01"
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                {counted !== '' && (
                  <p
                    className={
                      Number(counted) === data.caja?.saldoEsperado ? 'teal' : 'text-danger'
                    }
                  >
                    Diferencia: {money(Number(counted) - (data.caja?.saldoEsperado || 0))}
                  </p>
                )}
              </>
            )}
            {mode === 'movimiento' && (
              <div className="form-grid">
                <label>
                  Tipo
                  <select name="tipo">
                    <option value="entrada">Entrada de efectivo</option>
                    <option value="salida">Salida de efectivo</option>
                  </select>
                </label>
                <label>
                  Importe (MXN)
                  <input
                    name="importe"
                    type="number"
                    required
                    min="0.01"
                    max="99999999"
                    step="0.01"
                    placeholder="0.00"
                  />
                </label>
                <label className="span-2">
                  Concepto
                  <input
                    name="concepto"
                    required
                    minLength={3}
                    maxLength={200}
                    placeholder="Ej. Aportación de capital o gasto de sucursal"
                  />
                </label>
              </div>
            )}
            {error && <Notice error>{error}</Notice>}
            <div className="modal-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setMode('')}
                disabled={busy}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy
                  ? 'Guardando…'
                  : mode === 'cerrar'
                    ? 'Confirmar corte'
                    : mode === 'abrir'
                      ? 'Abrir caja'
                      : 'Guardar movimiento'}
                <Check size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function SaleModal({
  item,
  close,
  saved,
}: {
  item: InventoryItem;
  close: () => void;
  saved: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await send(`inventario/${item.id}/venta`, {
        importe: Number(form.importe),
        metodo: form.metodo,
      });
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Una nueva oportunidad para esta pieza"
      subtitle="Registra la venta de la garantía adjudicada."
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit} className="modal-body">
        <div className="loan-review">
          <div>
            <h3>{item.descripcion}</h3>
            <p>
              {item.categoria} · Avalúo {money(item.avaluo)}
            </p>
          </div>
          <Banknote size={26} />
        </div>
        <div className="form-grid">
          <label>
            Precio de venta (MXN)
            <input
              type="number"
              name="importe"
              required
              min="0.01"
              max="99999999"
              step="0.01"
              defaultValue={item.avaluo}
            />
          </label>
          <label>
            Método de pago
            <select name="metodo">
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
            </select>
          </label>
        </div>
        {error && <Notice error>{error}</Notice>}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={close}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Registrando…' : 'Confirmar venta'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Reports({ data }: { data: ReportData }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DECISIONES CON PERSPECTIVA</span>
          <h1>
            La historia en números<span className="teal">.</span>
          </h1>
          <p>Resultados acumulados de tu operación y estado de tu cartera.</p>
        </div>
        <button
          className="button secondary"
          onClick={() =>
            downloadCSV('reporte-integra-cash.csv', [
              ['Indicador', 'Valor'],
              ['Capital colocado acumulado', data.prestado],
              ['Capital recuperado acumulado', data.recuperado],
              ['Intereses cobrados acumulados', data.intereses],
              ['Ventas acumuladas', data.ventas],
              ['Cartera actual', data.cartera],
              ['Empeños vencidos', data.vencidos],
            ])
          }
        >
          <Download size={16} />
          Exportar reporte
        </button>
      </div>
      <div className="metric-grid">
        {[
          { label: 'Capital colocado', value: data.prestado, icon: ArrowUpRight },
          { label: 'Capital recuperado', value: data.recuperado, icon: ArrowDownLeft },
          { label: 'Intereses cobrados', value: data.intereses, icon: CircleDollarSign },
          { label: 'Ventas de garantías', value: data.ventas, icon: Banknote },
        ].map((m) => (
          <div className="metric-card" key={m.label}>
            <div className="metric-label">
              {m.label}
              <span className="metric-icon mint">
                <m.icon size={18} />
              </span>
            </div>
            <strong>{money(m.value)}</strong>
            <span className="metric-detail">Acumulado de tu operación</span>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Flujo de capital</h2>
            <p>Préstamos entregados y pagos cobrados en los últimos 7 días</p>
          </div>
          <div className="chart-legend">
            <span>
              <i />
              Colocado
            </span>
            <span>
              <i />
              Cobrado
            </span>
          </div>
        </div>
        <Chart points={data.chart} />
      </section>
      <div className="report-bottom">
        <section className="panel">
          <div className="panel-heading">
            <h2>Composición de cartera</h2>
          </div>
          <div className="category-report">
            {data.categories.length ? (
              data.categories.map((c, i) => (
                <div key={c.name}>
                  <div>
                    <span>
                      <i
                        style={{ background: ['#238e84', '#6e93b8', '#c4a570', '#9497be'][i % 4] }}
                      />
                      {c.name}
                    </span>
                    <b>{money(c.value)}</b>
                  </div>
                  <progress max={Math.max(data.cartera, 1)} value={c.value} />
                </div>
              ))
            ) : (
              <Empty
                title="Una cartera por construir"
                text="Tus garantías se agruparán por categoría."
              />
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Indicadores operativos</h2>
          </div>
          <div className="report-stats">
            {[
              ['Cartera vigente', money(data.cartera)],
              ['Empeños registrados', data.empenos],
              ['Desempeños registrados', data.desempenados],
              ['Próximos a vencer', data.porVencer],
              ['Empeños vencidos', data.vencidos],
            ].map(([key, val]) => (
              <div key={key}>
                <span>{key}</span>
                <strong>{val}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export function Settings({
  data,
  saved,
  admin,
}: {
  data: BusinessConfig;
  saved: () => void;
  admin: boolean;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setSuccess(false);
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await send(
        'configuracion',
        {
          nombreNegocio: form.nombreNegocio,
          tasaMensual: Number(form.tasaMensual),
          plazoDias: Number(form.plazoDias),
          porcentajePrestamo: Number(form.porcentajePrestamo),
          diasGracia: Number(form.diasGracia),
        },
        'PUT',
      );
      saved();
      setSuccess(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LA MEDIDA DE TU OPERACIÓN</span>
          <h1>
            Tu negocio, tus reglas<span className="teal">.</span>
          </h1>
          <p>Configura los valores predeterminados de los nuevos empeños.</p>
        </div>
      </div>
      <div className="settings-layout">
        <form className="panel settings-form" onSubmit={submit}>
          <div className="panel-heading">
            <div>
              <h2>Condiciones de operación</h2>
              <p>Los contratos existentes conservan las condiciones pactadas.</p>
            </div>
            <span className="metric-icon mint">
              <Save size={20} />
            </span>
          </div>
          <fieldset disabled={!admin || busy}>
            <div className="form-grid">
              <label className="span-2">
                Nombre del negocio
                <input
                  required
                  name="nombreNegocio"
                  defaultValue={data.nombreNegocio}
                  maxLength={120}
                />
              </label>
              <label>
                Tasa mensual predeterminada (%)
                <input
                  type="number"
                  required
                  name="tasaMensual"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={data.tasaMensual}
                />
              </label>
              <label>
                Plazo predeterminado (días)
                <input
                  type="number"
                  required
                  name="plazoDias"
                  min="1"
                  max="365"
                  step="1"
                  defaultValue={data.plazoDias}
                />
              </label>
              <label>
                Préstamo sugerido sobre avalúo (%)
                <input
                  type="number"
                  required
                  name="porcentajePrestamo"
                  min="1"
                  max="100"
                  step="1"
                  defaultValue={data.porcentajePrestamo}
                />
                <small className="input-help">
                  Se utiliza si la categoría no tiene un porcentaje propio.
                </small>
              </label>
              <label>
                Días de gracia para adjudicación
                <input
                  type="number"
                  required
                  name="diasGracia"
                  min="0"
                  max="90"
                  step="1"
                  defaultValue={data.diasGracia}
                />
              </label>
            </div>
            {error && <Notice error>{error}</Notice>}
            {success && <Notice>Configuración guardada.</Notice>}
            <div className="modal-footer">
              <button className="button primary" disabled={!admin || busy}>
                {busy ? 'Guardando…' : 'Guardar configuración'}
                <Check size={16} />
              </button>
            </div>
          </fieldset>
        </form>
        <aside className="settings-info">
          <LockKeyhole size={26} strokeWidth={1.5} />
          <h3>Una base clara para cada operación.</h3>
          <p>
            El interés se calcula de forma simple sobre una base de 30 días, con un mínimo
            equivalente al plazo contratado.
          </p>
          <p>
            El refrendo cubre los intereses y extiende el plazo. Un abono reduce capital y conserva
            el interés del periodo actual.
          </p>
          <p>
            La adjudicación requiere una cuenta de administrador y haber superado el vencimiento más
            los días de gracia.
          </p>
          {!admin && (
            <Notice error>Solo el administrador puede modificar esta configuración.</Notice>
          )}
        </aside>
      </div>
    </>
  );
}
