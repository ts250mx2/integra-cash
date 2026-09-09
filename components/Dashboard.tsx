'use client';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  FileCheck2,
  Plus,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import type { DashboardData, Loan } from '@/lib/types';
import { Chart, Empty, LoanTable, money } from './ui';
export default function Dashboard({
  data,
  name,
  navigate,
  newLoan,
  selectLoan,
}: {
  data: DashboardData;
  name: string;
  navigate: (tab: string) => void;
  newLoan: () => void;
  selectLoan: (loan: Loan) => void;
}) {
  const m = data.metrics;
  const total = data.categories.reduce((a, c) => a + c.value, 0);
  const colors = ['#58d4c5', '#7498bd', '#d4b987', '#b5cbdc'];
  let angle = 0;
  const segments = data.categories.map((c, i) => {
    const start = angle;
    angle += total ? (c.value / total) * 360 : 0;
    return `${colors[i % 4]} ${start}deg ${angle}deg`;
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CADA DÍA, NUEVAS OPORTUNIDADES</span>
          <h1>
            Todo bajo control<span className="teal">.</span>
          </h1>
          <p>Hola, {name.split(' ')[0]}. Este es el pulso de tu negocio hoy.</p>
        </div>
        <button className="button primary" onClick={newLoan}>
          <Plus size={18} />
          Nuevo empeño
        </button>
      </div>
      <div className="metric-grid">
        {[
          {
            label: 'Capital en cartera',
            value: money(m.capitalActivo),
            detail: 'Saldo de préstamos activos',
            icon: CircleDollarSign,
            tone: 'mint',
          },
          {
            label: 'Empeños activos',
            value: m.empenosActivos,
            detail: 'Garantías en resguardo',
            icon: FileCheck2,
            tone: 'blue',
          },
          {
            label: 'Próximos a vencer',
            value: m.porVencer,
            detail: 'Atención en los siguientes 7 días',
            icon: CalendarClock,
            tone: 'gold',
          },
          {
            label: 'Disponible en caja',
            value: money(m.cajaDisponible),
            detail: data.cash ? 'Caja abierta · lista para operar' : 'Abre caja para comenzar',
            icon: Wallet,
            tone: 'violet',
          },
        ].map((s, i) => (
          <button
            className="metric-card"
            key={s.label}
            onClick={() => navigate(i === 3 ? 'caja' : i === 2 ? 'vencimientos' : 'empenos')}
          >
            <div className="metric-label">
              {s.label}
              <span className={`metric-icon ${s.tone}`}>
                <s.icon size={18} strokeWidth={1.8} />
              </span>
            </div>
            <strong>{s.value}</strong>
            <span className="metric-detail">
              {i === 3 && data.cash && <i className="live-dot" />}
              {s.detail}
              <ArrowUpRight size={13} />
            </span>
          </button>
        ))}
      </div>
      <div className="dashboard-middle">
        <section className="portfolio-card">
          <div className="portfolio-top">
            <span className="eyebrow">TU CARTERA, EN PERSPECTIVA</span>
            <span className="outline-badge">
              <ShieldCheck size={13} /> En resguardo
            </span>
          </div>
          <div className="portfolio-content">
            <div>
              <p>
                Valor que genera
                <br />
                nuevas posibilidades.
              </p>
              <strong>
                {money(m.capitalActivo)}
                <small>MXN</small>
              </strong>
              <span className="portfolio-caption">Distribución de capital por garantía</span>
            </div>
            <div
              className="donut"
              style={{
                background: total
                  ? `conic-gradient(${segments.join(',')})`
                  : 'conic-gradient(#315065 0deg 280deg,#416379 280deg 360deg)',
              }}
            >
              <div>
                <span>{m.empenosActivos}</span>
                <small>empeños</small>
              </div>
            </div>
          </div>
          <div className="portfolio-legend">
            {data.categories.length ? (
              data.categories.map((c, i) => (
                <span key={c.name}>
                  <i style={{ background: colors[i % 4] }} />
                  {c.name}
                  <b>{total ? Math.round((c.value / total) * 100) : 0}%</b>
                </span>
              ))
            ) : (
              <span>
                <i style={{ background: '#58d4c5' }} />
                Tu primera garantía inicia la historia
              </span>
            )}
          </div>
        </section>
        <section className="panel cashflow">
          <div className="panel-heading">
            <div>
              <h2>Movimiento de capital</h2>
              <p>Préstamos y cobros de los últimos 7 días</p>
            </div>
            <span className="period-tag">Esta semana</span>
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
          <Chart points={data.chart} />
        </section>
      </div>
      {!data.cash && !m.empenosActivos && (
        <div className="getting-started">
          <span className="setup-icon">
            <Banknote size={25} />
          </span>
          <div>
            <h3>Tu operación está lista para comenzar</h3>
            <p>Abre tu caja, registra un cliente y crea tu primer empeño.</p>
          </div>
          <button className="button secondary" onClick={() => navigate('caja')}>
            Abrir mi caja
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      <div className="dashboard-bottom">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                Últimos empeños <span className="count">{data.recent.length}</span>
              </h2>
              <p>Las operaciones más recientes de tu sucursal</p>
            </div>
            <button className="text-button" onClick={() => navigate('empenos')}>
              Ver todos
              <ArrowRight size={15} />
            </button>
          </div>
          <LoanTable loans={data.recent.slice(0, 5)} onSelect={selectLoan} />
        </section>
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Actividad de caja</h2>
              <p>Los movimientos más recientes</p>
            </div>
            <span className="live-dot" />
          </div>
          {!data.activity.length ? (
            <Empty title="Un nuevo comienzo" text="Aquí verás las entradas y salidas de tu caja." />
          ) : (
            <div className="activity-list">
              {data.activity.slice(0, 5).map((a) => (
                <div className="activity" key={a.id}>
                  <span className={`activity-icon ${a.tipo}`}>
                    {a.tipo === 'entrada' ? (
                      <ArrowDownLeft size={17} />
                    ) : (
                      <ArrowUpRight size={17} />
                    )}
                  </span>
                  <div>
                    <b>{a.concepto}</b>
                    <span>
                      {new Date(a.fecha).toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <strong className={a.tipo === 'entrada' ? 'teal' : ''}>
                    {a.tipo === 'entrada' ? '+' : '−'}
                    {money(a.importe)}
                  </strong>
                </div>
              ))}
            </div>
          )}
          <button className="activity-bottom" onClick={() => navigate('caja')}>
            Ir a movimientos de caja
            <ArrowRight size={15} />
          </button>
        </section>
      </div>
    </>
  );
}
