'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Box,
  CalendarDays,
  CalendarClock,
  ChartNoAxesCombined,
  Check,
  CircleHelp,
  ClipboardList,
  Download,
  Gem,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react';
import type {
  BusinessConfig,
  CashData,
  Client,
  DashboardData,
  InventoryItem,
  Loan,
  ReportData,
} from '@/lib/types';
import AuthScreen, { type User } from './AuthScreen';
import useCollection from './useCollection';
import Dashboard from './Dashboard';
import { ClientForm, LoanDrawer, NewLoan } from './LoanForms';
import { CashPanel, Reports, SaleModal, Settings } from './Operations';
import {
  api,
  Badge,
  downloadCSV,
  Empty,
  LoanTable,
  Modal,
  money,
  Notice,
  send,
  Spinner,
} from './ui';

const nav = [
  { id: 'dashboard', name: 'Vista general', icon: LayoutDashboard },
  { id: 'empenos', name: 'Empeños', icon: ClipboardList },
  { id: 'clientes', name: 'Clientes', icon: UsersRound },
  { id: 'vencimientos', name: 'Vencimientos', icon: CalendarClock },
  { id: 'inventario', name: 'Bóveda e inventario', icon: Gem },
  { id: 'caja', name: 'Control de caja', icon: Wallet },
  { id: 'reportes', name: 'Reportes', icon: ChartNoAxesCombined },
];
interface Data {
  dashboard: DashboardData;
  clients: Client[];
  loans: Loan[];
  inventory: InventoryItem[];
  cash: CashData;
  reports: ReportData;
  config: BusinessConfig;
}
export default function Workspace() {
  const [session, setSession] = useState<{ user: User | null; needsSetup: boolean } | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState('');
  const [newLoan, setNewLoan] = useState(false);
  const [clientForm, setClientForm] = useState<Client | 'new' | null>(null);
  const [loanId, setLoanId] = useState<number | null>(null);
  const [sale, setSale] = useState<InventoryItem | null>(null);
  const [help, setHelp] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const notify = useCallback((message: string) => setToast(message), []);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashboard, clients, loans, inventory, cash, reports, config] = await Promise.all([
        api<DashboardData>('dashboard'),
        api<Client[]>('clientes'),
        api<Loan[]>('empenos'),
        api<InventoryItem[]>('inventario'),
        api<CashData>('caja'),
        api<ReportData>('reportes'),
        api<BusinessConfig>('configuracion'),
      ]);
      setData({ dashboard, clients, loans, inventory, cash, reports, config });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    api<{ user: User | null; needsSetup: boolean }>('auth/session')
      .then((s) => {
        setSession(s);
        if (s.user) void load();
      })
      .catch((e) => setError(e.message));
    const applyLocation = () => {
      const view = new URLSearchParams(window.location.search).get('view');
      if (view && [...nav.map((n) => n.id), 'configuracion'].includes(view)) setTab(view);
      else setTab('dashboard');
    };
    applyLocation();
    window.addEventListener('popstate', applyLocation);
    const expire = () => {
      setSession({ user: null, needsSetup: false });
      setData(null);
    };
    window.addEventListener('session-expired', expire);
    const shortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => {
      window.removeEventListener('popstate', applyLocation);
      window.removeEventListener('session-expired', expire);
      window.removeEventListener('keydown', shortcut);
    };
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  function navigate(view: string) {
    setTab(view);
    setSearch('');
    setFilter('all');
    setMobile(false);
    window.history.pushState({}, '', view === 'dashboard' ? '/' : `/?view=${view}`);
  }
  function startLoan() {
    if (!data?.cash.caja) {
      navigate('caja');
      notify('Abre una caja con fondos para entregar un nuevo préstamo.');
      return;
    }
    setNewLoan(true);
  }
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await send('auth/logout', {});
      setSession({ user: null, needsSetup: false });
      setData(null);
      setNewLoan(false);
      setLoanId(null);
      setClientForm(null);
      setSale(null);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoggingOut(false);
    }
  }
  const endpoint =
    tab === 'clientes'
      ? 'clientes'
      : tab === 'inventario'
        ? 'inventario'
        : ['empenos', 'vencimientos'].includes(tab)
          ? 'empenos'
          : null;
  const collection = useCollection<Client | Loan | InventoryItem>(
    session?.user ? endpoint : null,
    new URLSearchParams({
      q: search,
      status: tab === 'vencimientos' && filter === 'all' ? 'seguimiento' : filter,
    }).toString(),
    data,
  );
  const loans = endpoint === 'empenos' ? (collection.items as Loan[]) : [];
  const clients = endpoint === 'clientes' ? (collection.items as Client[]) : [];
  const inventory = endpoint === 'inventario' ? (collection.items as InventoryItem[]) : [];
  async function findArticleLoan(item: InventoryItem) {
    try {
      const found = await api<Loan[]>(`empenos?q=${encodeURIComponent(item.folio)}`);
      const loan = found.find((l) => l.articuloId === item.id);
      if (loan) setLoanId(loan.id);
      else notify('No se encontró la boleta de esta garantía.');
    } catch (e) {
      notify((e as Error).message);
    }
  }
  if (!session)
    return (
      <div className="boot-screen">
        <div className="brand">
          <span className="brand-mark">
            <Box size={28} />
          </span>
          <span>
            integra<span className="brand-cash">cash</span>
          </span>
        </div>
        {error ? (
          <>
            <Notice error>{error}</Notice>
            <button className="button secondary" onClick={() => window.location.reload()}>
              Volver a intentar
            </button>
          </>
        ) : (
          <Spinner />
        )}
      </div>
    );
  if (!session.user)
    return (
      <AuthScreen
        setup={session.needsSetup}
        onLogin={(user) => {
          setSession({ user, needsSetup: false });
          window.history.replaceState({}, '', '/');
          setTab('dashboard');
          void load();
        }}
      />
    );
  const user = session.user;
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Cerrar navegación"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <Link
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('dashboard');
          }}
        >
          <span className="brand-mark">
            <Box size={28} strokeWidth={1.6} />
          </span>
          <span>
            integra<span className="brand-cash">cash</span>
            <small>CASA DE EMPEÑOS</small>
          </span>
        </Link>
        <div className="branch">
          <span className="branch-icon">
            <Box size={17} />
          </span>
          <div>
            <b>Sucursal principal</b>
            <span>
              <i className="live-dot" />
              Centro de operaciones
            </span>
          </div>
          <ShieldCheck size={15} />
        </div>
        <span className="nav-label">TU ESPACIO DE TRABAJO</span>
        <nav aria-label="Menú principal">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${tab === n.id ? 'active' : ''}`}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} strokeWidth={1.7} />
              <span>{n.name}</span>
              {n.id === 'vencimientos' && !!data?.dashboard.metrics.porVencer && (
                <b className="nav-count">{data.dashboard.metrics.porVencer}</b>
              )}
              {n.id === tab && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <span>
              <ShieldCheck size={19} />
              Un paso adelante.
            </span>
            <p>La claridad también es parte de un buen negocio.</p>
            <button onClick={() => setHelp(true)}>
              Conoce tu espacio
              <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className={`nav-item ${tab === 'configuracion' ? 'active' : ''}`}
            onClick={() => navigate('configuracion')}
          >
            <Settings2 size={19} strokeWidth={1.7} />
            <span>Configuración</span>
          </button>
          <div className="sidebar-version">
            <span>INTEGRA CASH</span>
            <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-toggle"
              aria-label="Abrir navegación"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Mi negocio</span>
            <span className="breadcrumb-slash">/</span>
            <b>{nav.find((n) => n.id === tab)?.name || 'Configuración'}</b>
          </div>
          <div className="topbar-actions">
            <span className="today">
              <CalendarDays size={15} />
              {new Date().toLocaleDateString('es-MX', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            <button
              className="icon-button notification-button"
              aria-label="Consultar vencimientos"
              onClick={() => navigate('vencimientos')}
            >
              <Bell size={19} />
              {!!data?.dashboard.metrics.porVencer && <i />}
            </button>
            <span className="topbar-divider" />
            <div className="profile">
              <span className="avatar">
                {user.name
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <span>
                <b>{user.name}</b>
                <small>{user.role === 'admin' ? 'Administrador' : 'Operador'}</small>
              </span>
            </div>
            <button
              className="icon-button"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              disabled={loggingOut}
              onClick={() => void logout()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main className="workspace">
          <div className="workspace-topline">
            <span>
              <i className={`live-dot ${error ? 'offline' : ''}`} />
              {loading
                ? 'Actualizando tu operación'
                : error
                  ? 'Revisa la conexión'
                  : 'Tu operación, conectada'}
            </span>
            <button onClick={() => setHelp(true)}>
              <CircleHelp size={14} />
              Ayuda rápida
            </button>
          </div>
          {error && (
            <div className="error-retry">
              <Notice error>{error}</Notice>
              <button className="button secondary" onClick={() => void load()}>
                Reintentar
              </button>
            </div>
          )}
          {!data ? (
            <Spinner />
          ) : (
            <>
              {tab === 'dashboard' && (
                <Dashboard
                  data={data.dashboard}
                  name={user.name}
                  navigate={navigate}
                  newLoan={startLoan}
                  selectLoan={(l) => setLoanId(l.id)}
                />
              )}
              {(tab === 'empenos' || tab === 'vencimientos') && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        {tab === 'vencimientos'
                          ? 'EL MOMENTO DE DAR SEGUIMIENTO'
                          : 'CADA GARANTÍA TIENE UNA HISTORIA'}
                      </span>
                      <h1>
                        {tab === 'vencimientos'
                          ? 'Anticípate al vencimiento'
                          : 'Tu cartera de empeños'}
                        <span className="teal">.</span>
                      </h1>
                      <p>
                        {tab === 'vencimientos'
                          ? 'Prioriza los contratos vencidos y próximos a vencer.'
                          : 'Consulta, refrenda y recupera garantías desde un mismo lugar.'}
                      </p>
                    </div>
                    <button className="button primary" onClick={startLoan}>
                      <Plus size={17} />
                      Nuevo empeño
                    </button>
                  </div>
                  <section className="panel">
                    <div className="list-toolbar">
                      <div className="search-field">
                        <Search size={17} />
                        <input
                          ref={searchRef}
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Buscar cliente, folio o garantía…"
                          aria-label="Buscar empeños"
                        />
                        <kbd>Ctrl K</kbd>
                      </div>
                      <button
                        className="button secondary compact"
                        onClick={() =>
                          downloadCSV('cartera-empenos.csv', [
                            [
                              'Folio',
                              'Cliente',
                              'Garantía',
                              'Capital pendiente',
                              'Interés',
                              'Vencimiento',
                              'Estado',
                            ],
                            ...loans.map((l) => [
                              l.folio,
                              l.cliente,
                              l.articulo,
                              l.saldoCapital,
                              l.interes,
                              l.fechaVencimiento,
                              l.status,
                            ]),
                          ])
                        }
                      >
                        <Download size={15} />
                        Exportar
                      </button>
                    </div>
                    <div className="filter-tabs" aria-label="Estado de los empeños">
                      {(tab === 'vencimientos'
                        ? [
                            ['all', 'Todos'],
                            ['por_vencer', 'Próximos a vencer'],
                            ['vencido', 'Vencidos'],
                          ]
                        : [
                            ['all', 'Todos'],
                            ['vigente', 'Vigentes'],
                            ['por_vencer', 'Por vencer'],
                            ['vencido', 'Vencidos'],
                            ['desempenado', 'Desempeñados'],
                            ['adjudicado', 'Adjudicados'],
                          ]
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          className={filter === id ? 'active' : ''}
                          onClick={() => setFilter(id)}
                        >
                          {label}
                          {filter === id && <span>{loans.length}</span>}
                        </button>
                      ))}
                    </div>
                    {collection.loading ? (
                      <Spinner />
                    ) : loans.length ? (
                      <LoanTable
                        loans={[...loans].sort((a, b) =>
                          tab === 'vencimientos' ? a.diasRestantes - b.diasRestantes : b.id - a.id,
                        )}
                        onSelect={(l) => setLoanId(l.id)}
                      />
                    ) : (
                      <Empty
                        title={
                          search || filter !== 'all'
                            ? 'No encontramos coincidencias'
                            : tab === 'vencimientos'
                              ? 'Por ahora, todo al día'
                              : 'Tu primera boleta está por comenzar'
                        }
                        text={
                          search || filter !== 'all'
                            ? 'Prueba otro nombre, folio o estado.'
                            : tab === 'vencimientos'
                              ? 'Aquí aparecerán los empeños que necesiten seguimiento.'
                              : 'Registra una garantía y empieza a hacer crecer tu cartera.'
                        }
                        action={
                          tab === 'empenos' && !search && filter === 'all' ? (
                            <button className="button primary" onClick={startLoan}>
                              <Plus size={16} />
                              Crear empeño
                            </button>
                          ) : undefined
                        }
                      />
                    )}
                    <div className="table-footer">
                      <span>{loans.length} operaciones en esta vista</span>
                      <span>Importes en MXN</span>
                    </div>
                  </section>
                </>
              )}
              {tab === 'clientes' && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">RELACIONES QUE VALEN</span>
                      <h1>
                        Conoce a tus clientes<span className="teal">.</span>
                      </h1>
                      <p>Su información y sus operaciones, siempre cerca.</p>
                    </div>
                    <button className="button primary" onClick={() => setClientForm('new')}>
                      <Plus size={17} />
                      Nuevo cliente
                    </button>
                  </div>
                  <section className="panel">
                    <div className="list-toolbar">
                      <div className="search-field">
                        <Search size={17} />
                        <input
                          ref={searchRef}
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Buscar nombre, teléfono o identificación…"
                          aria-label="Buscar clientes"
                        />
                      </div>
                      <span className="period-tag">
                        {data.dashboard.metrics.clientesTotal} clientes
                      </span>
                    </div>
                    {collection.loading ? (
                      <Spinner />
                    ) : clients.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Cliente</th>
                              <th>Contacto</th>
                              <th>Identificación</th>
                              <th>Empeños activos</th>
                              <th>Consultar</th>
                            </tr>
                          </thead>
                          <tbody>
                            {clients.map((c) => (
                              <tr key={c.id}>
                                <td>
                                  <div className="client-cell">
                                    <span className="avatar">
                                      {c.nombre
                                        .split(' ')
                                        .map((n) => n[0])
                                        .slice(0, 2)
                                        .join('')}
                                    </span>
                                    <span>
                                      <button
                                        className="table-link"
                                        onClick={() => setClientForm(c)}
                                      >
                                        {c.nombre}
                                      </button>
                                      <small>Cliente #{String(c.id).padStart(4, '0')}</small>
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  {c.telefono}
                                  <span className="cell-sub">
                                    {c.email || 'Sin correo registrado'}
                                  </span>
                                </td>
                                <td>{c.identificacion}</td>
                                <td>
                                  <span className="count">{c.empenosActivos || 0}</span>
                                </td>
                                <td>
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      navigate('empenos');
                                      setSearch(c.nombre);
                                    }}
                                  >
                                    Ver empeños
                                    <ArrowUpRight size={15} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty
                        title={
                          search ? 'No encontramos ese cliente' : 'Todo empieza con una persona'
                        }
                        text={
                          search
                            ? 'Intenta con otro nombre o teléfono.'
                            : 'Registra a tu primer cliente y haz que su siguiente visita sea más fácil.'
                        }
                      />
                    )}
                  </section>
                </>
              )}
              {tab === 'inventario' && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">CADA PIEZA, EN EL LUGAR CORRECTO</span>
                      <h1>
                        Dentro de tu bóveda<span className="teal">.</span>
                      </h1>
                      <p>Localiza garantías, consulta su estado y gestiona las piezas en venta.</p>
                    </div>
                    <span className="inventory-label">
                      <ShieldCheck size={17} />
                      {data.dashboard.metrics.empenosActivos} garantías en resguardo
                    </span>
                  </div>
                  <section className="panel">
                    <div className="list-toolbar">
                      <div className="search-field">
                        <Search size={17} />
                        <input
                          ref={searchRef}
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Buscar pieza, serie, boleta o ubicación…"
                          aria-label="Buscar garantías"
                        />
                      </div>
                      <div className="select-filter">
                        <SlidersHorizontal size={16} />
                        <select
                          aria-label="Filtrar inventario"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        >
                          <option value="all">Todos los estados</option>
                          {[
                            ['resguardo', 'En resguardo'],
                            ['venta', 'En venta'],
                            ['vendido', 'Vendidos'],
                            ['entregado', 'Entregados'],
                          ].map(([id, label]) => (
                            <option value={id} key={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {collection.loading ? (
                      <Spinner />
                    ) : inventory.length ? (
                      <div className="inventory-grid">
                        {inventory.map((i, index) => (
                          <article className="inventory-card" key={i.id}>
                            <div className={`item-art art-${index % 4}`}>
                              <Gem size={60} strokeWidth={0.8} />
                              <span>{i.categoria}</span>
                              <Badge status={i.status} />
                            </div>
                            <div className="inventory-card-body">
                              <span className="eyebrow">{i.folio}</span>
                              <h3>{i.descripcion}</h3>
                              <p>{[i.marca, i.modelo].filter(Boolean).join(' ') || i.condicion}</p>
                              <div className="item-location">
                                <Box size={14} />
                                {i.ubicacion}
                              </div>
                              <div className="item-bottom">
                                <span>
                                  Avalúo<strong>{money(i.avaluo)}</strong>
                                </span>
                                {i.status === 'venta' ? (
                                  <button
                                    className="button primary compact"
                                    onClick={() => setSale(i)}
                                  >
                                    Vender
                                    <ArrowRight size={14} />
                                  </button>
                                ) : (
                                  <button
                                    className="icon-button"
                                    aria-label={`Ver boleta de ${i.descripcion}`}
                                    onClick={() => void findArticleLoan(i)}
                                  >
                                    <ArrowUpRight size={19} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        title={
                          search || filter !== 'all'
                            ? 'No hay piezas en esta vista'
                            : 'Un lugar para cada garantía'
                        }
                        text={
                          search || filter !== 'all'
                            ? 'Prueba otro filtro o búsqueda.'
                            : 'Las garantías se agregan automáticamente al registrar un empeño.'
                        }
                      />
                    )}
                  </section>
                </>
              )}
              {tab === 'caja' && (
                <CashPanel data={data.cash} reload={() => void load()} notify={notify} />
              )}
              {tab === 'reportes' && <Reports data={data.reports} />}
              {tab === 'configuracion' && (
                <Settings
                  data={data.config}
                  saved={() => void load()}
                  admin={user.role === 'admin'}
                />
              )}
            </>
          )}
          {endpoint && collection.error && <Notice error>{collection.error}</Notice>}
          {endpoint && collection.hasMore && (
            <div className="collection-more">
              <span>
                {collection.items.length} registros cargados · Exporta los registros de esta vista
              </span>
              <button
                className="button secondary"
                disabled={collection.busy}
                onClick={() => void collection.loadMore()}
              >
                {collection.busy ? 'Cargando…' : 'Cargar más registros'}
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          <footer className="workspace-footer">
            <span>Hecho para que todo fluya.</span>
            <span>
              <ShieldCheck size={13} /> Integra Cash ·{' '}
              {data?.config.nombreNegocio || 'Tu casa de empeños'}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {toast}
          <button
            className="icon-button"
            onClick={() => setToast('')}
            aria-label="Cerrar notificación"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {newLoan && data && (
        <NewLoan
          cashOpen={!!data.cash.caja}
          close={() => setNewLoan(false)}
          saved={(l) => {
            setNewLoan(false);
            setLoanId(l.id);
            notify(`Empeño ${l.folio} registrado. Préstamo entregado.`);
            void load();
          }}
        />
      )}
      {clientForm && (
        <ClientForm
          client={clientForm === 'new' ? undefined : clientForm}
          close={() => setClientForm(null)}
          saved={() => {
            setClientForm(null);
            notify('Cliente guardado.');
            void load();
          }}
        />
      )}
      {loanId && (
        <LoanDrawer
          id={loanId}
          close={() => setLoanId(null)}
          updated={() => void load()}
          admin={user.role === 'admin'}
        />
      )}
      {sale && (
        <SaleModal
          item={sale}
          close={() => setSale(null)}
          saved={() => {
            setSale(null);
            notify('Venta registrada. El inventario y la caja se actualizaron.');
            void load();
          }}
        />
      )}
      {help && (
        <Modal
          title="Un espacio que trabaja contigo"
          subtitle="Lo esencial para operar con claridad."
          close={() => setHelp(false)}
        >
          <div className="modal-body">
            <div className="help-steps">
              {[
                [Wallet, 'Abre tu caja', 'Define el fondo de efectivo con el que inicia tu turno.'],
                [
                  UsersRound,
                  'Conoce a tu cliente',
                  'Registra su información de contacto e identificación.',
                ],
                [
                  Gem,
                  'Valúa y presta',
                  'Identifica la garantía, define su avalúo y confirma el préstamo.',
                ],
                [
                  CalendarClock,
                  'Da seguimiento',
                  'Refrenda, recibe abonos o cobra el desempeño desde la boleta.',
                ],
                [
                  ShieldCheck,
                  'Cierra con claridad',
                  'Cuenta tu efectivo y genera el corte al terminar.',
                ],
              ].map(([Icon, title, description], i) => {
                const I = Icon as typeof Wallet;
                return (
                  <div key={i}>
                    <span>
                      <I size={21} />
                    </span>
                    <div>
                      <h3>{String(title)}</h3>
                      <p>{String(description)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="keyboard-tip">
              <kbd>Ctrl</kbd> + <kbd>K</kbd>
              <span>Enfoca la búsqueda en clientes, empeños e inventario.</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
