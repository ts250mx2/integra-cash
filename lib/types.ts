export type LoanStatus = 'vigente' | 'por_vencer' | 'vencido' | 'desempenado' | 'adjudicado';
export type PaymentMethod = 'efectivo' | 'transferencia' | 'tarjeta';
export interface Client {
  id: number;
  nombre: string;
  telefono: string;
  email: string;
  identificacion: string;
  direccion: string;
  notas: string;
  fechaAlta: string;
  empenosActivos?: number;
}
export interface Category {
  id: number;
  nombre: string;
  icono: string;
  porcentajePrestamo: number;
}
export interface Loan {
  id: number;
  folio: string;
  clienteId: number;
  cliente: string;
  telefono: string;
  articuloId: number;
  articulo: string;
  categoria: string;
  capital: number;
  saldoCapital: number;
  tasaInteres: number;
  plazoDias: number;
  fechaAlta: string;
  fechaVencimiento: string;
  status: LoanStatus;
  diasRestantes: number;
  interes: number;
  totalDesempeno: number;
  refrendos: number;
  ubicacion: string;
  notas: string;
}
export interface Payment {
  id: number;
  tipo: 'refrendo' | 'desempeno' | 'abono';
  capital: number;
  interes: number;
  importe: number;
  metodo: PaymentMethod;
  fecha: string;
  referencia: string;
}
export interface InventoryItem {
  id: number;
  descripcion: string;
  categoria: string;
  marca: string;
  modelo: string;
  serie: string;
  condicion: string;
  peso: number | null;
  quilataje: string;
  avaluo: number;
  ubicacion: string;
  status: 'resguardo' | 'venta' | 'vendido' | 'entregado';
  folio: string;
  cliente: string;
}
export interface LoanDetail extends Loan {
  articuloDetalle: InventoryItem;
  clienteDetalle: Client;
  pagos: Payment[];
}
export interface Cash {
  id: number;
  fechaApertura: string;
  fechaCierre: string | null;
  fondoInicial: number;
  saldoEsperado: number;
  efectivoContado: number | null;
  diferencia: number | null;
  status: 'abierta' | 'cerrada';
}
export interface CashMovement {
  id: number;
  tipo: 'entrada' | 'salida';
  concepto: string;
  importe: number;
  referencia: string;
  fecha: string;
}
export interface ChartPoint {
  label: string;
  prestado: number;
  recuperado: number;
}
export interface CategoryValue {
  name: string;
  value: number;
}
export interface DashboardData {
  metrics: {
    capitalActivo: number;
    empenosActivos: number;
    porVencer: number;
    cajaDisponible: number;
    interesesMes: number;
    clientesTotal: number;
  };
  recent: Loan[];
  dueSoon: Loan[];
  activity: CashMovement[];
  chart: ChartPoint[];
  categories: CategoryValue[];
  cash: Cash | null;
}
export interface CashData {
  caja: Cash | null;
  movimientos: CashMovement[];
  historial: Cash[];
}
export interface ReportData {
  prestado: number;
  recuperado: number;
  intereses: number;
  ventas: number;
  cartera: number;
  porVencer: number;
  vencidos: number;
  empenos: number;
  desempenados: number;
  chart: ChartPoint[];
  categories: CategoryValue[];
}
export interface BusinessConfig {
  nombreNegocio: string;
  tasaMensual: number;
  plazoDias: number;
  porcentajePrestamo: number;
  diasGracia: number;
}
