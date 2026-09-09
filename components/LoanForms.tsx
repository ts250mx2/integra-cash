'use client';
import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Gem,
  Info,
  Printer,
  UserRound,
  Wallet,
} from 'lucide-react';
import type {
  BusinessConfig,
  Category,
  Client,
  Loan,
  LoanDetail,
  PaymentMethod,
} from '@/lib/types';
import { api, Badge, date, Modal, money, Notice, send, Spinner } from './ui';

export function ClientForm({
  client,
  close,
  saved,
}: {
  client?: Client;
  close: () => void;
  saved: (client: Client) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await send<Client>(
        client ? `clientes/${client.id}` : 'clientes',
        Object.fromEntries(new FormData(e.currentTarget)),
        client ? 'PUT' : 'POST',
      );
      saved(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={client ? 'Editar cliente' : 'Un nuevo cliente, una oportunidad'}
      subtitle="Su información siempre a la mano para la próxima visita."
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit} className="modal-body">
        <div className="form-grid">
          <label className="span-2">
            Nombre completo
            <input
              name="nombre"
              required
              defaultValue={client?.nombre}
              placeholder="Nombre y apellidos"
              maxLength={150}
            />
          </label>
          <label>
            Teléfono
            <input
              name="telefono"
              type="tel"
              required
              minLength={10}
              maxLength={20}
              defaultValue={client?.telefono}
              placeholder="10 dígitos"
            />
          </label>
          <label>
            Correo electrónico <small>Opcional</small>
            <input
              type="email"
              name="email"
              maxLength={160}
              defaultValue={client?.email}
              placeholder="correo@ejemplo.com"
            />
          </label>
          <label className="span-2">
            Identificación oficial / folio
            <input
              name="identificacion"
              required
              defaultValue={client?.identificacion}
              placeholder="Tipo de identificación y número"
              maxLength={80}
            />
          </label>
          <label className="span-2">
            Dirección
            <input
              name="direccion"
              defaultValue={client?.direccion}
              placeholder="Calle, número, colonia y ciudad"
              maxLength={250}
            />
          </label>
          <label className="span-2">
            Notas <small>Opcional</small>
            <textarea
              name="notas"
              rows={2}
              defaultValue={client?.notas}
              placeholder="Información útil para su atención"
              maxLength={1000}
            />
          </label>
        </div>
        {error && <Notice error>{error}</Notice>}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={close}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar cliente'}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function NewLoan({
  close,
  saved,
  cashOpen,
}: {
  close: () => void;
  saved: (loan: Loan) => void;
  cashOpen: boolean;
}) {
  const [step, setStep] = useState(0);
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [config, setConfig] = useState<BusinessConfig | null>(null);
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [article, setArticle] = useState({
    categoriaId: 0,
    descripcion: '',
    marca: '',
    modelo: '',
    serie: '',
    condicion: 'Bueno',
    peso: '',
    quilataje: '',
    avaluo: '',
    ubicacion: '',
  });
  const [terms, setTerms] = useState({
    capital: '',
    tasaInteres: '10',
    plazoDias: '30',
    notas: '',
  });
  useEffect(() => {
    Promise.all([
      api<Client[]>('clientes'),
      api<Category[]>('categorias'),
      api<BusinessConfig>('configuracion'),
    ])
      .then(([c, a, conf]) => {
        setClients(c);
        setCategories(a);
        setConfig(conf);
        setTerms((t) => ({
          ...t,
          tasaInteres: String(conf.tasaMensual),
          plazoDias: String(conf.plazoDias),
        }));
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (step !== 0) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<Client[]>(`clientes?q=${encodeURIComponent(search)}`, { signal: controller.signal })
        .then(setClients)
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, step]);
  const client = clients.find((c) => c.id === clientId);
  const suggested = Math.round(
    (Number(article.avaluo) *
      (categories.find((c) => c.id === article.categoriaId)?.porcentajePrestamo ||
        config?.porcentajePrestamo ||
        65)) /
      100,
  );
  const interest =
    Math.round(
      ((((Number(terms.capital) * Number(terms.tasaInteres)) / 100) * Number(terms.plazoDias)) /
        30) *
        100,
    ) / 100;
  async function create() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const loan = await send<Loan>('empenos', {
        clienteId: clientId,
        articulo: {
          ...article,
          avaluo: Number(article.avaluo),
          peso: article.peso ? Number(article.peso) : null,
        },
        ...terms,
        capital: Number(terms.capital),
        tasaInteres: Number(terms.tasaInteres),
        plazoDias: Number(terms.plazoDias),
      });
      saved(loan);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        title="Nuevo empeño"
        subtitle="Una operación clara, de principio a fin."
        close={() => {
          if (!busy) close();
        }}
        wide
      >
        <div className="steps">
          {[
            { name: 'Cliente', icon: UserRound },
            { name: 'Garantía', icon: Gem },
            { name: 'Préstamo', icon: Wallet },
          ].map((s, i) => (
            <div
              className={`step ${i === step ? 'active' : ''} ${i < step ? 'complete' : ''}`}
              key={s.name}
            >
              <span>{i < step ? <Check size={16} /> : <s.icon size={16} />}</span>
              <b>{s.name}</b>
              {i < 2 && <ChevronRight size={15} />}
            </div>
          ))}
        </div>
        <div className="modal-body">
          {!cashOpen && (
            <Notice error>
              Abre una caja con fondos disponibles antes de entregar un préstamo.
            </Notice>
          )}
          {error && <Notice error>{error}</Notice>}
          {step === 0 && (
            <>
              <div className="section-line">
                <div>
                  <h3>¿A quién vamos a atender?</h3>
                  <p>Selecciona un cliente o registra su primera visita.</p>
                </div>
                <button className="text-button" onClick={() => setCreating(true)}>
                  + Nuevo cliente
                </button>
              </div>
              <input
                aria-label="Buscar cliente para empeño"
                placeholder="Buscar por nombre o teléfono…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="client-search"
              />
              <div className="client-options">
                {clients
                  .filter((c) =>
                    `${c.nombre} ${c.telefono}`.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((c) => (
                    <button
                      key={c.id}
                      className={`client-option ${clientId === c.id ? 'selected' : ''}`}
                      onClick={() => setClientId(c.id)}
                    >
                      <span className="avatar">
                        {c.nombre
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')}
                      </span>
                      <span>
                        <b>{c.nombre}</b>
                        <small>
                          {c.telefono} · {c.identificacion}
                        </small>
                      </span>
                      {clientId === c.id && <CheckCircle2 size={20} />}
                    </button>
                  ))}
                {!clients.length && (
                  <p className="inline-empty">Registra tu primer cliente para continuar.</p>
                )}
              </div>
              <div className="modal-footer">
                <button className="button secondary" onClick={close}>
                  Cancelar
                </button>
                <button className="button primary" disabled={!clientId} onClick={() => setStep(1)}>
                  Continuar con la garantía
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
          {step === 1 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setTerms((t) => ({ ...t, capital: t.capital || String(suggested) }));
                setStep(2);
              }}
            >
              <div className="selected-customer">
                <UserRound size={17} />
                {client?.nombre}
                <span>Cliente seleccionado</span>
              </div>
              <div className="form-grid">
                <label>
                  Categoría
                  <select
                    required
                    value={article.categoriaId || ''}
                    onChange={(e) => setArticle({ ...article, categoriaId: +e.target.value })}
                  >
                    <option value="">Seleccionar categoría</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Estado físico
                  <select
                    value={article.condicion}
                    onChange={(e) => setArticle({ ...article, condicion: e.target.value })}
                  >
                    <option>Bueno</option>
                    <option>Excelente</option>
                    <option>Regular</option>
                    <option>Con detalles</option>
                  </select>
                </label>
                <label className="span-2">
                  Descripción de la garantía
                  <input
                    required
                    value={article.descripcion}
                    onChange={(e) => setArticle({ ...article, descripcion: e.target.value })}
                    placeholder="Ej. Anillo de oro amarillo con piedra central"
                    maxLength={200}
                  />
                </label>
                <label>
                  Marca
                  <input
                    value={article.marca}
                    onChange={(e) => setArticle({ ...article, marca: e.target.value })}
                    placeholder="Marca del artículo"
                    maxLength={80}
                  />
                </label>
                <label>
                  Modelo
                  <input
                    value={article.modelo}
                    onChange={(e) => setArticle({ ...article, modelo: e.target.value })}
                    placeholder="Modelo o referencia"
                    maxLength={80}
                  />
                </label>
                <label>
                  Número de serie
                  <input
                    value={article.serie}
                    onChange={(e) => setArticle({ ...article, serie: e.target.value })}
                    placeholder="Serie / IMEI, si aplica"
                    maxLength={100}
                  />
                </label>
                <label>
                  Ubicación en bóveda
                  <input
                    required
                    value={article.ubicacion}
                    onChange={(e) => setArticle({ ...article, ubicacion: e.target.value })}
                    placeholder="Ej. Bóveda A · Charola 03"
                    maxLength={100}
                  />
                </label>
                <label>
                  Peso en gramos <small>Si aplica</small>
                  <input
                    type="number"
                    min="0.01"
                    max="999999.99"
                    step="0.01"
                    value={article.peso}
                    onChange={(e) => setArticle({ ...article, peso: e.target.value })}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  Quilataje <small>Si aplica</small>
                  <select
                    value={article.quilataje}
                    onChange={(e) => setArticle({ ...article, quilataje: e.target.value })}
                  >
                    <option value="">No aplica</option>
                    {['8k', '10k', '14k', '18k', '22k', '24k', 'Plata .925', 'Plata .999'].map(
                      (k) => (
                        <option key={k}>{k}</option>
                      ),
                    )}
                  </select>
                </label>
                <label className="span-2">
                  Valor del avalúo (MXN)
                  <input
                    type="number"
                    required
                    min="1"
                    max="99999999"
                    step="0.01"
                    value={article.avaluo}
                    onChange={(e) => setArticle({ ...article, avaluo: e.target.value })}
                    placeholder="0.00"
                  />
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="button secondary" onClick={() => setStep(0)}>
                  <ArrowLeft size={16} />
                  Cliente
                </button>
                <button className="button primary">
                  Definir préstamo
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}
          {step === 2 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <div className="loan-review">
                <div>
                  <span className="eyebrow">GARANTÍA</span>
                  <h3>{article.descripcion}</h3>
                  <p>
                    {client?.nombre} · Avalúo {money(Number(article.avaluo))}
                  </p>
                </div>
                <Gem size={30} strokeWidth={1.2} />
              </div>
              <div className="form-grid">
                <label className="span-2">
                  Monto a prestar (MXN)
                  <input
                    type="number"
                    required
                    min="1"
                    max={article.avaluo}
                    step="0.01"
                    value={terms.capital}
                    onChange={(e) => setTerms({ ...terms, capital: e.target.value })}
                  />
                  <small className="input-help">
                    Sugerido por categoría: {money(suggested)} · Máximo: valor del avalúo
                  </small>
                </label>
                <label>
                  Tasa de interés mensual (%)
                  <input
                    type="number"
                    required
                    min="0"
                    max="100"
                    step="0.01"
                    value={terms.tasaInteres}
                    onChange={(e) => setTerms({ ...terms, tasaInteres: e.target.value })}
                  />
                </label>
                <label>
                  Plazo (días)
                  <input
                    type="number"
                    required
                    min="1"
                    max="365"
                    step="1"
                    value={terms.plazoDias}
                    onChange={(e) => setTerms({ ...terms, plazoDias: e.target.value })}
                  />
                </label>
                <label className="span-2">
                  Observaciones
                  <textarea
                    rows={2}
                    value={terms.notas}
                    onChange={(e) => setTerms({ ...terms, notas: e.target.value })}
                    maxLength={1000}
                    placeholder="Accesorios recibidos, detalles y acuerdos de la operación"
                  />
                </label>
              </div>
              <div className="quote">
                <div>
                  <span>Entregas al cliente</span>
                  <b>{money(Number(terms.capital))}</b>
                </div>
                <div>
                  <span>Interés del plazo</span>
                  <b>{money(interest)}</b>
                </div>
                <div className="quote-total">
                  <span>Total para recuperar su garantía</span>
                  <strong>{money(Number(terms.capital) + interest)}</strong>
                </div>
              </div>
              <p className="form-note">
                <Info size={15} />
                Interés simple proporcional a 30 días, mínimo el plazo contratado. El atraso genera
                interés diario adicional. Revisa las condiciones antes de confirmar.
              </p>
              <div className="modal-footer">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft size={16} />
                  Garantía
                </button>
                <button className="button primary" disabled={busy || !cashOpen || !config}>
                  {busy ? 'Registrando…' : 'Confirmar y entregar préstamo'}
                  <Check size={16} />
                </button>
              </div>
            </form>
          )}
        </div>
      </Modal>
      {creating && (
        <ClientForm
          close={() => setCreating(false)}
          saved={(c) => {
            setClients([...clients, c]);
            setClientId(c.id);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

export function LoanDrawer({
  id,
  close,
  updated,
  admin,
}: {
  id: number;
  close: () => void;
  updated: () => void;
  admin: boolean;
}) {
  const [loan, setLoan] = useState<LoanDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<'refrendo' | 'desempeno' | 'abono' | 'adjudicar' | ''>('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [receipt, setReceipt] = useState<number | null>(null);
  useEffect(() => {
    api<LoanDetail>(`empenos/${id}`)
      .then(setLoan)
      .catch((e) => setError(e.message));
  }, [id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!loan || busy || !action) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'adjudicar') {
        await send(`empenos/${id}/adjudicar`, {});
        setLoan(await api<LoanDetail>(`empenos/${id}`));
      } else {
        const result = await send<{ loan: Loan; pagoId: number }>(`empenos/${id}/pago`, {
          tipo: action,
          importe:
            action === 'abono'
              ? Number(amount)
              : action === 'refrendo'
                ? loan.interes
                : loan.totalDesempeno,
          metodo: method,
          saldoCapitalEsperado: loan.saldoCapital,
          fechaVencimientoEsperada: loan.fechaVencimiento,
        });
        setReceipt(result.pagoId);
        setLoan(await api<LoanDetail>(`empenos/${id}`));
      }
      setAction('');
      updated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const active = loan && !['desempenado', 'adjudicado'].includes(loan.status);
  return (
    <Modal
      title={loan?.folio || 'Detalle del empeño'}
      subtitle="Toda la historia de esta operación."
      close={() => {
        if (!busy) close();
      }}
      wide
    >
      <div className="modal-body">
        {error && <Notice error>{error}</Notice>}
        {!loan ? (
          <Spinner />
        ) : (
          <>
            <div className="loan-detail-header">
              <span className="detail-gem">
                <Gem size={30} strokeWidth={1.3} />
              </span>
              <div>
                <h3>{loan.articulo}</h3>
                <p>
                  {loan.categoria} · {loan.ubicacion}
                </p>
              </div>
              <Badge status={loan.status} />
            </div>
            <div className="detail-metrics">
              <div>
                <span>Capital pendiente</span>
                <strong>{money(loan.saldoCapital)}</strong>
              </div>
              <div>
                <span>Interés al día de hoy</span>
                <strong>{money(loan.interes)}</strong>
              </div>
              <div>
                <span>Desempeño total</span>
                <strong className="teal">{money(loan.totalDesempeno)}</strong>
              </div>
            </div>
            <div className="detail-grid">
              <div>
                <span>Cliente</span>
                <b>{loan.cliente}</b>
                <small>{loan.telefono}</small>
              </div>
              <div>
                <span>Vencimiento</span>
                <b>{date(loan.fechaVencimiento, true)}</b>
                <small>
                  {loan.plazoDias} días · {loan.tasaInteres}% mensual
                </small>
              </div>
              <div>
                <span>Descripción</span>
                <b>
                  {[loan.articuloDetalle.marca, loan.articuloDetalle.modelo]
                    .filter(Boolean)
                    .join(' ') || loan.articulo}
                </b>
                <small>Serie: {loan.articuloDetalle.serie || 'No registrada'}</small>
              </div>
              <div>
                <span>Avalúo / refrendos</span>
                <b>{money(loan.articuloDetalle.avaluo)}</b>
                <small>{loan.refrendos} refrendos registrados</small>
              </div>
            </div>
            {loan.notas && <p className="detail-note">{loan.notas}</p>}
            {receipt && (
              <Notice>
                Pago registrado.{' '}
                <a href={`/print/pago/${receipt}`} target="_blank" rel="noreferrer">
                  Imprimir recibo ↗
                </a>
              </Notice>
            )}
            {active && !action && (
              <div className="loan-actions">
                <button className="button primary" onClick={() => setAction('refrendo')}>
                  Refrendar
                </button>
                <button className="button secondary" onClick={() => setAction('desempeno')}>
                  Desempeñar
                </button>
                <button className="button secondary" onClick={() => setAction('abono')}>
                  Abonar a capital
                </button>
                {admin && loan.status === 'vencido' && (
                  <button className="text-button danger" onClick={() => setAction('adjudicar')}>
                    Adjudicar
                  </button>
                )}
              </div>
            )}
            {action && (
              <form className="payment-form" onSubmit={submit}>
                <h3>
                  {
                    {
                      refrendo: 'Confirmar refrendo',
                      desempeno: 'Recuperación de la garantía',
                      abono: 'Abono a capital',
                      adjudicar: 'Pasar garantía a venta',
                    }[action]
                  }
                </h3>
                {action === 'adjudicar' ? (
                  <p>
                    Esta acción cierra el empeño y mueve el artículo a inventario disponible para
                    venta. Se validará que haya transcurrido el plazo de gracia configurado.
                  </p>
                ) : (
                  <>
                    <p>
                      {action === 'refrendo'
                        ? 'Cobra el interés pendiente y extiende la fecha por un nuevo plazo.'
                        : action === 'desempeno'
                          ? 'Cobra el saldo total y entrega la garantía al cliente.'
                          : 'Reduce el capital pendiente. El interés del plazo actual y el vencimiento se conservan.'}
                    </p>
                    <div className="form-grid">
                      <label>
                        {action === 'abono' ? 'Importe a abonar' : 'Total a cobrar'}
                        <input
                          type="number"
                          min={action === 'refrendo' ? 0 : 0.01}
                          max={
                            action === 'abono' ? Math.max(0, loan.saldoCapital - 0.01) : undefined
                          }
                          required
                          step="0.01"
                          readOnly={action !== 'abono'}
                          value={
                            action === 'abono'
                              ? amount
                              : action === 'refrendo'
                                ? loan.interes
                                : loan.totalDesempeno
                          }
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      </label>
                      <label>
                        Método de pago
                        <select
                          value={method}
                          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                        >
                          <option value="efectivo">Efectivo</option>
                          <option value="transferencia">Transferencia</option>
                          <option value="tarjeta">Tarjeta</option>
                        </select>
                      </label>
                    </div>
                  </>
                )}
                <div className="modal-footer">
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => setAction('')}
                  >
                    Cancelar
                  </button>
                  <button className="button primary" disabled={busy}>
                    {busy
                      ? 'Procesando…'
                      : action === 'adjudicar'
                        ? 'Confirmar adjudicación'
                        : 'Confirmar cobro'}
                  </button>
                </div>
              </form>
            )}
            <div className="section-line">
              <h3>Historial de pagos</h3>
              <a
                className="text-button"
                href={`/print/empeno/${loan.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <Printer size={15} />
                Imprimir boleta
              </a>
            </div>
            {loan.pagos.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Operación</th>
                      <th>Método</th>
                      <th>Importe</th>
                      <th>Recibo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loan.pagos.map((p) => (
                      <tr key={p.id}>
                        <td>{date(p.fecha)}</td>
                        <td className="capitalize">
                          {p.tipo === 'desempeno' ? 'Desempeño' : p.tipo}
                        </td>
                        <td className="capitalize">{p.metodo}</td>
                        <td className="amount">{money(p.importe)}</td>
                        <td>
                          <a
                            className="icon-button"
                            href={`/print/pago/${p.id}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Imprimir pago ${p.id}`}
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
              <div className="inline-empty">Aún no se han registrado pagos en esta boleta.</div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
