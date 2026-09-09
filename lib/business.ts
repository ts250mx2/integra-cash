import pool, { transaction } from './db';
import { requireUser } from './auth';
import { ApiError, handleError, assertSameOrigin } from './http';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  BusinessConfig,
  Cash,
  CashMovement,
  Category,
  ChartPoint,
  Client,
  InventoryItem,
  Loan,
  Payment,
  PaymentMethod,
} from './types';

type DB = Pool | PoolConnection;
type Actor = { id: number; name: string; role: string };
type Input = Record<string, unknown>;
const DAY = 86_400_000;
const LOAN_SELECT = `SELECT e.*, c.Nombre Cliente, c.Telefono, a.Descripcion Articulo,
 a.Ubicacion, cat.Categoria FROM tblEmpenos e JOIN tblClientes c ON c.IdCliente=e.IdCliente
 JOIN tblArticulos a ON a.IdArticulo=e.IdArticulo JOIN tblCategorias cat ON cat.IdCategoria=a.IdCategoria`;
const CLIENT_SELECT = `SELECT c.*, (SELECT COUNT(*) FROM tblEmpenos e WHERE e.IdCliente=c.IdCliente AND e.Status='vigente') EmpenosActivos FROM tblClientes c`;
const INVENTORY_SELECT = `SELECT a.*, cat.Categoria, e.Folio, c.Nombre Cliente FROM tblArticulos a
 JOIN tblCategorias cat ON cat.IdCategoria=a.IdCategoria LEFT JOIN tblEmpenos e ON e.IdArticulo=a.IdArticulo
 LEFT JOIN tblClientes c ON c.IdCliente=e.IdCliente`;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function dateOnly(value: unknown): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value ?? '').slice(0, 10);
}
export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);
}
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}
export function renewalDue(due: string, term: number, asOf = today()): string {
  return addDays(due > asOf ? due : asOf, term);
}
/** Simple monthly interest (30 days): one contracted term minimum, then daily overdue interest.
 * CapitalPeriodo preserves the term's interest basis when principal is partially repaid.
 * A renewal settles all interest and resets that basis to the remaining principal. */
export function quoteInterest(
  base: number,
  monthlyRate: number,
  term: number,
  due: string,
  asOf = today(),
): number {
  const overdueDays = Math.max(0, daysBetween(due, asOf));
  return roundMoney((((base * monthlyRate) / 100) * (term + overdueDays)) / 30);
}
export function money(value: unknown, label: string, min = 0, max = 99_999_999.99): number {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    value === '' ||
    (typeof value === 'string' && !value.trim())
  )
    throw new ApiError(400, `${label} es obligatorio.`);
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < min ||
    number > max ||
    Math.abs(number * 100 - Math.round(number * 100)) > 0.00001
  )
    throw new ApiError(
      400,
      `${label} debe ser un importe válido entre ${min} y ${max}, con máximo dos decimales.`,
    );
  return roundMoney(number);
}
export function integer(
  value: unknown,
  label = 'Identificador',
  min = 1,
  max = 2_147_483_647,
): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '')
    throw new ApiError(400, `${label} no es válido.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max)
    throw new ApiError(400, `${label} debe ser un entero entre ${min} y ${max}.`);
  return number;
}
function textValue(value: unknown, label: string, max: number, required = false): string {
  if (value != null && typeof value !== 'string') throw new ApiError(400, `${label} no es válido.`);
  const result = ((value as string | undefined) ?? '').trim();
  if ((required && !result) || result.length > max)
    throw new ApiError(
      400,
      `${label}${required ? ' es obligatorio y' : ''} debe tener máximo ${max} caracteres.`,
    );
  return result;
}
function input(value: unknown): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiError(400, 'Datos no válidos.');
  return value as Input;
}
function method(value: unknown): PaymentMethod {
  if (!['efectivo', 'transferencia', 'tarjeta'].includes(String(value)))
    throw new ApiError(400, 'Selecciona un método de pago válido.');
  return value as PaymentMethod;
}
function admin(actor: Actor): void {
  if (actor.role !== 'admin') throw new ApiError(403, 'Esta acción requiere un administrador.');
}
function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const s = String(value ?? '');
  return s
    ? s.replace(' ', 'T') + (s.includes('Z') || /[+-]\d\d:\d\d$/.test(s) ? '' : '-06:00')
    : '';
}
async function rows(sql: string, values: unknown[] = [], db: DB = pool): Promise<RowDataPacket[]> {
  const [result] = await db.query<RowDataPacket[]>(sql, values);
  return result;
}
async function write(
  sql: string,
  values: (string | number | boolean | Date | null)[],
  db: DB,
): Promise<ResultSetHeader> {
  const [result] = await db.execute<ResultSetHeader>(sql, values);
  return result;
}
async function audit(
  db: DB,
  actor: Actor,
  action: string,
  entity: string,
  id: number,
  detail: object = {},
) {
  await write(
    'INSERT INTO tblAuditoria (IdUsuario,Accion,Entidad,IdEntidad,Detalle) VALUES (?,?,?,?,?)',
    [actor.id, action, entity, id, JSON.stringify(detail)],
    db,
  );
}
export async function api(
  work: (actor: Actor) => Promise<unknown>,
  status = 200,
): Promise<Response> {
  try {
    const actor = await requireUser();
    return Response.json(await work(actor), { status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleError(error);
  }
}
export async function body(request: Request): Promise<Input> {
  assertSameOrigin(request);
  try {
    return input(await request.json());
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'El cuerpo de la solicitud debe ser JSON válido.');
  }
}

function toClient(row: RowDataPacket): Client {
  return {
    id: Number(row.IdCliente),
    nombre: row.Nombre,
    telefono: row.Telefono,
    email: row.Email ?? '',
    identificacion: row.Identificacion,
    direccion: row.Direccion ?? '',
    notas: row.Notas ?? '',
    fechaAlta: iso(row.FechaAlta),
    empenosActivos: Number(row.EmpenosActivos ?? 0),
  };
}
function toCash(row: RowDataPacket): Cash {
  return {
    id: Number(row.IdCaja),
    fechaApertura: iso(row.FechaApertura),
    fechaCierre: row.FechaCierre ? iso(row.FechaCierre) : null,
    fondoInicial: Number(row.FondoInicial),
    saldoEsperado: Number(row.SaldoEsperado),
    efectivoContado: row.EfectivoContado == null ? null : Number(row.EfectivoContado),
    diferencia: row.Diferencia == null ? null : Number(row.Diferencia),
    status: row.Status,
  };
}
function toMovement(row: RowDataPacket): CashMovement {
  return {
    id: Number(row.IdMovimiento),
    tipo: row.Tipo,
    concepto: row.Concepto,
    importe: Number(row.Importe),
    referencia: row.Referencia ?? '',
    fecha: iso(row.Fecha),
  };
}
function toInventory(row: RowDataPacket): InventoryItem {
  return {
    id: Number(row.IdArticulo),
    descripcion: row.Descripcion,
    categoria: row.Categoria,
    marca: row.Marca ?? '',
    modelo: row.Modelo ?? '',
    serie: row.Serie ?? '',
    condicion: row.Condicion,
    peso: row.Peso == null ? null : Number(row.Peso),
    quilataje: row.Quilataje ?? '',
    avaluo: Number(row.Avaluo),
    ubicacion: row.Ubicacion,
    status: row.Status,
    folio: row.Folio ?? '',
    cliente: row.Cliente ?? '',
  };
}
function toPayment(row: RowDataPacket): Payment {
  return {
    id: Number(row.IdPago),
    tipo: row.Tipo,
    capital: Number(row.Capital),
    interes: Number(row.Interes),
    importe: Number(row.Importe),
    metodo: row.Metodo,
    fecha: iso(row.Fecha),
    referencia: row.Referencia ?? '',
  };
}
function toLoan(row: RowDataPacket): Loan {
  const due = dateOnly(row.FechaVencimiento),
    days = daysBetween(today(), due);
  const interest =
    row.Status === 'vigente'
      ? quoteInterest(
          Number(row.CapitalPeriodo),
          Number(row.TasaInteres),
          Number(row.PlazoDias),
          due,
        )
      : 0;
  const balance = Number(row.SaldoCapital);
  return {
    id: Number(row.IdEmpeno),
    folio: row.Folio,
    clienteId: Number(row.IdCliente),
    cliente: row.Cliente,
    telefono: row.Telefono,
    articuloId: Number(row.IdArticulo),
    articulo: row.Articulo,
    categoria: row.Categoria,
    capital: Number(row.Capital),
    saldoCapital: balance,
    tasaInteres: Number(row.TasaInteres),
    plazoDias: Number(row.PlazoDias),
    fechaAlta: iso(row.FechaAlta),
    fechaVencimiento: due,
    status:
      row.Status === 'vigente'
        ? days < 0
          ? 'vencido'
          : days <= 7
            ? 'por_vencer'
            : 'vigente'
        : row.Status,
    diasRestantes: days,
    interes: interest,
    totalDesempeno: row.Status === 'vigente' ? roundMoney(balance + interest) : 0,
    refrendos: Number(row.Refrendos),
    ubicacion: row.Ubicacion ?? '',
    notas: row.Notas ?? '',
  };
}

export async function getClients(q = '', offset = 0): Promise<Client[]> {
  const search = `%${q.trim().slice(0, 120)}%`;
  return (
    await rows(
      `${CLIENT_SELECT} WHERE c.Nombre LIKE ? OR c.Telefono LIKE ? OR c.Identificacion LIKE ? ORDER BY c.Nombre,c.IdCliente LIMIT 500 OFFSET ?`,
      [search, search, search, integer(offset, 'Posición', 0)],
    )
  ).map(toClient);
}
export async function saveClient(data: Input, actor: Actor, id?: number): Promise<Client> {
  const nombre = textValue(data.nombre, 'El nombre', 160, true),
    telefono = textValue(data.telefono, 'El teléfono', 30, true),
    email = textValue(data.email, 'El correo', 160),
    identification = textValue(data.identificacion, 'La identificación', 80, true),
    direccion = textValue(data.direccion, 'La dirección', 400),
    notas = textValue(data.notas, 'Las notas', 2000);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ApiError(400, 'El correo electrónico no es válido.');
  if (!/^[+()\d\s.-]{7,30}$/.test(telefono)) throw new ApiError(400, 'El teléfono no es válido.');
  return transaction(async (db) => {
    if (id) {
      if (
        !(await rows('SELECT IdCliente FROM tblClientes WHERE IdCliente=? FOR UPDATE', [id], db))
          .length
      )
        throw new ApiError(404, 'Cliente no encontrado.');
      await write(
        'UPDATE tblClientes SET Nombre=?,Telefono=?,Email=?,Identificacion=?,Direccion=?,Notas=? WHERE IdCliente=?',
        [nombre, telefono, email, identification, direccion, notas, id],
        db,
      );
    } else {
      id = (
        await write(
          'INSERT INTO tblClientes (Nombre,Telefono,Email,Identificacion,Direccion,Notas) VALUES (?,?,?,?,?,?)',
          [nombre, telefono, email, identification, direccion, notas],
          db,
        )
      ).insertId;
    }
    await audit(db, actor, 'cliente.guardar', 'cliente', id);
    return toClient((await rows(`${CLIENT_SELECT} WHERE c.IdCliente=?`, [id], db))[0]);
  });
}
export async function getCategories(): Promise<Category[]> {
  return (await rows('SELECT * FROM tblCategorias ORDER BY IdCategoria')).map((row) => ({
    id: Number(row.IdCategoria),
    nombre: row.Categoria,
    icono: row.Icono,
    porcentajePrestamo: Number(row.PorcentajePrestamo),
  }));
}
export async function getLoans(q = '', status = 'all', offset = 0): Promise<Loan[]> {
  const conditions: string[] = [],
    values: unknown[] = [];
  if (q.trim()) {
    conditions.push(
      '(e.Folio LIKE ? OR c.Nombre LIKE ? OR a.Descripcion LIKE ? OR c.Telefono LIKE ?)',
    );
    const search = `%${q.trim().slice(0, 120)}%`;
    values.push(search, search, search, search);
  }
  if (status === 'vigente') {
    conditions.push("e.Status='vigente' AND e.FechaVencimiento>?");
    values.push(addDays(today(), 7));
  } else if (status === 'por_vencer') {
    conditions.push("e.Status='vigente' AND e.FechaVencimiento BETWEEN ? AND ?");
    values.push(today(), addDays(today(), 7));
  } else if (status === 'vencido') {
    conditions.push("e.Status='vigente' AND e.FechaVencimiento<?");
    values.push(today());
  } else if (status === 'seguimiento') {
    conditions.push("e.Status='vigente' AND e.FechaVencimiento<=?");
    values.push(addDays(today(), 7));
  } else if (['desempenado', 'adjudicado'].includes(status)) {
    conditions.push('e.Status=?');
    values.push(status);
  } else if (status !== 'all') throw new ApiError(400, 'Estado de empeño no válido.');
  values.push(integer(offset, 'Posición', 0));
  return (
    await rows(
      `${LOAN_SELECT}${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''} ORDER BY ${status === 'seguimiento' ? 'e.FechaVencimiento ASC,' : ''} e.IdEmpeno DESC LIMIT 500 OFFSET ?`,
      values,
    )
  ).map(toLoan);
}
export async function getLoan(id: number, db: DB = pool): Promise<Loan> {
  const found = (await rows(`${LOAN_SELECT} WHERE e.IdEmpeno=?`, [id], db))[0];
  if (!found) throw new ApiError(404, 'Empeño no encontrado.');
  return toLoan(found);
}
export async function getLoanDetail(id: number) {
  const loan = await getLoan(id);
  const [articles, clients, payments] = await Promise.all([
    rows(`${INVENTORY_SELECT} WHERE a.IdArticulo=?`, [loan.articuloId]),
    rows(`${CLIENT_SELECT} WHERE c.IdCliente=?`, [loan.clienteId]),
    rows('SELECT * FROM tblPagos WHERE IdEmpeno=? ORDER BY IdPago DESC', [id]),
  ]);
  return {
    ...loan,
    articuloDetalle: toInventory(articles[0]),
    clienteDetalle: toClient(clients[0]),
    pagos: payments.map(toPayment),
  };
}
async function openCash(db: DB): Promise<RowDataPacket> {
  const cash = (
    await rows("SELECT * FROM tblCajas WHERE IdSucursal=1 AND Status='abierta' FOR UPDATE", [], db)
  )[0];
  if (!cash) throw new ApiError(409, 'Abre la caja antes de registrar esta operación.');
  return cash;
}
async function cashMovement(
  db: DB,
  cash: RowDataPacket,
  actor: Actor,
  type: 'entrada' | 'salida',
  amount: number,
  concept: string,
  reference: string,
) {
  const balance = roundMoney(Number(cash.SaldoEsperado) + (type === 'entrada' ? amount : -amount));
  if (balance < 0)
    throw new ApiError(409, 'La caja no tiene efectivo suficiente para esta operación.');
  await write(
    'INSERT INTO tblMovimientosCaja (IdCaja,IdUsuario,Tipo,Concepto,Importe,Referencia) VALUES (?,?,?,?,?,?)',
    [cash.IdCaja, actor.id, type, concept, amount, reference],
    db,
  );
  await write('UPDATE tblCajas SET SaldoEsperado=? WHERE IdCaja=?', [balance, cash.IdCaja], db);
  cash.SaldoEsperado = balance;
}
export async function createLoan(data: Input, actor: Actor): Promise<Loan> {
  const clientId = integer(data.clienteId, 'Cliente'),
    article = input(data.articulo),
    categoryId = integer(article.categoriaId, 'Categoría');
  const description = textValue(article.descripcion, 'La descripción del artículo', 250, true),
    brand = textValue(article.marca, 'La marca', 100),
    model = textValue(article.modelo, 'El modelo', 100),
    serial = textValue(article.serie, 'La serie', 120),
    condition = textValue(article.condicion, 'La condición', 80, true),
    location = textValue(article.ubicacion, 'La ubicación', 100, true),
    karat = textValue(article.quilataje, 'El quilataje', 20);
  const valuation = money(article.avaluo, 'Avalúo', 0.01),
    capital = money(data.capital, 'Capital', 0.01),
    rate = money(data.tasaInteres, 'Tasa mensual', 0, 100),
    term = integer(data.plazoDias, 'Plazo en días', 1, 365),
    notes = textValue(data.notas, 'Las notas', 2000);
  const weight =
    article.peso == null || article.peso === ''
      ? null
      : money(article.peso, 'Peso', 0.01, 999_999.99);
  if (capital > valuation)
    throw new ApiError(400, 'El préstamo no puede superar el avalúo del artículo.');
  return transaction(async (db) => {
    const cash = await openCash(db);
    if (!(await rows('SELECT IdCliente FROM tblClientes WHERE IdCliente=?', [clientId], db)).length)
      throw new ApiError(404, 'Cliente no encontrado.');
    if (
      !(await rows('SELECT IdCategoria FROM tblCategorias WHERE IdCategoria=?', [categoryId], db))
        .length
    )
      throw new ApiError(400, 'Categoría no válida.');
    const articleId = (
      await write(
        "INSERT INTO tblArticulos (IdCategoria,Descripcion,Marca,Modelo,Serie,Condicion,Peso,Quilataje,Avaluo,Ubicacion,Status) VALUES (?,?,?,?,?,?,?,?,?,?,'resguardo')",
        [
          categoryId,
          description,
          brand,
          model,
          serial,
          condition,
          weight,
          karat,
          valuation,
          location,
        ],
        db,
      )
    ).insertId;
    const id = (
      await write(
        "INSERT INTO tblEmpenos (Folio,IdCliente,IdArticulo,IdUsuario,IdSucursal,Capital,SaldoCapital,CapitalPeriodo,TasaInteres,PlazoDias,FechaVencimiento,Status,Notas,Refrendos) VALUES (?,?,?,?,1,?,?,?,?,?,?,'vigente',?,0)",
        [
          `TMP-${randomUUID()}`,
          clientId,
          articleId,
          actor.id,
          capital,
          capital,
          capital,
          rate,
          term,
          addDays(today(), term),
          notes,
        ],
        db,
      )
    ).insertId;
    const folio = `IC-${today().slice(0, 4)}-${String(id).padStart(6, '0')}`;
    await write('UPDATE tblEmpenos SET Folio=? WHERE IdEmpeno=?', [folio, id], db);
    await cashMovement(db, cash, actor, 'salida', capital, `Préstamo · ${folio}`, folio);
    await audit(db, actor, 'empeno.crear', 'empeno', id, { capital, folio });
    return getLoan(id, db);
  });
}
export async function payLoan(id: number, data: Input, actor: Actor) {
  const type = String(data.tipo),
    paymentMethod = method(data.metodo),
    amount = money(data.importe, 'Importe', 0);
  const expectedBalance = money(data.saldoCapitalEsperado, 'Saldo de la cotización', 0.01),
    expectedDue = textValue(data.fechaVencimientoEsperada, 'La fecha de la cotización', 10, true);
  if (!['refrendo', 'desempeno', 'abono'].includes(type))
    throw new ApiError(400, 'Tipo de pago no válido.');
  return transaction(async (db) => {
    const cash = await openCash(db);
    const row = (await rows('SELECT * FROM tblEmpenos WHERE IdEmpeno=? FOR UPDATE', [id], db))[0];
    if (!row) throw new ApiError(404, 'Empeño no encontrado.');
    if (row.Status !== 'vigente')
      throw new ApiError(409, 'Este empeño ya fue liquidado o adjudicado.');
    const balance = Number(row.SaldoCapital),
      due = dateOnly(row.FechaVencimiento),
      interest = quoteInterest(
        Number(row.CapitalPeriodo),
        Number(row.TasaInteres),
        Number(row.PlazoDias),
        due,
      );
    if (balance !== expectedBalance || due !== expectedDue)
      throw new ApiError(
        409,
        'El empeño cambió desde que abriste la cotización. Actualiza el detalle antes de cobrar.',
      );
    let principalPaid = 0,
      interestPaid = 0;
    if (type === 'abono') {
      if (amount <= 0) throw new ApiError(400, 'El abono debe ser mayor a cero.');
      if (amount >= balance)
        throw new ApiError(
          400,
          'Para liquidar el capital completo, selecciona desempeño e incluye el interés pendiente.',
        );
      principalPaid = amount;
      await write(
        'UPDATE tblEmpenos SET SaldoCapital=? WHERE IdEmpeno=?',
        [roundMoney(balance - amount), id],
        db,
      );
    } else {
      const expected = type === 'refrendo' ? interest : roundMoney(balance + interest);
      if (Math.round(amount * 100) !== Math.round(expected * 100))
        throw new ApiError(
          409,
          `El importe cambió. El ${type === 'refrendo' ? 'refrendo' : 'desempeño'} requiere $${expected.toFixed(2)}. Actualiza el detalle.`,
        );
      interestPaid = interest;
      if (type === 'refrendo')
        await write(
          'UPDATE tblEmpenos SET FechaVencimiento=?,CapitalPeriodo=SaldoCapital,Refrendos=Refrendos+1 WHERE IdEmpeno=?',
          [renewalDue(due, Number(row.PlazoDias)), id],
          db,
        );
      else {
        principalPaid = balance;
        await write(
          "UPDATE tblEmpenos SET SaldoCapital=0,Status='desempenado' WHERE IdEmpeno=?",
          [id],
          db,
        );
        await write(
          "UPDATE tblArticulos SET Status='entregado' WHERE IdArticulo=?",
          [row.IdArticulo],
          db,
        );
      }
    }
    const paymentId = (
      await write(
        'INSERT INTO tblPagos (IdEmpeno,IdUsuario,IdCaja,Tipo,Capital,Interes,Importe,Metodo,Referencia) VALUES (?,?,?,?,?,?,?,?,?)',
        [
          id,
          actor.id,
          cash.IdCaja,
          type,
          principalPaid,
          interestPaid,
          amount,
          paymentMethod,
          row.Folio,
        ],
        db,
      )
    ).insertId;
    if (paymentMethod === 'efectivo' && amount > 0)
      await cashMovement(
        db,
        cash,
        actor,
        'entrada',
        amount,
        `${type === 'refrendo' ? 'Refrendo' : type === 'abono' ? 'Abono a capital' : 'Desempeño'} · ${row.Folio}`,
        `P-${paymentId}`,
      );
    await audit(db, actor, `empeno.${type}`, 'empeno', id, {
      pagoId: paymentId,
      importe: amount,
      metodo: paymentMethod,
    });
    return { loan: await getLoan(id, db), pagoId: paymentId };
  });
}
export async function adjudicateLoan(id: number, actor: Actor): Promise<Loan> {
  admin(actor);
  return transaction(async (db) => {
    const row = (await rows('SELECT * FROM tblEmpenos WHERE IdEmpeno=? FOR UPDATE', [id], db))[0];
    if (!row) throw new ApiError(404, 'Empeño no encontrado.');
    if (row.Status !== 'vigente') throw new ApiError(409, 'Este empeño no está activo.');
    const config = await getConfig(db),
      eligible = addDays(dateOnly(row.FechaVencimiento), config.diasGracia);
    if (today() <= eligible)
      throw new ApiError(
        409,
        `El periodo de gracia finaliza el ${eligible}. Podrás adjudicar a partir del ${addDays(eligible, 1)}.`,
      );
    await write("UPDATE tblEmpenos SET Status='adjudicado' WHERE IdEmpeno=?", [id], db);
    await write("UPDATE tblArticulos SET Status='venta' WHERE IdArticulo=?", [row.IdArticulo], db);
    await audit(db, actor, 'empeno.adjudicar', 'empeno', id, {
      saldoCapital: Number(row.SaldoCapital),
    });
    return getLoan(id, db);
  });
}
export async function getInventory(q = '', status = 'all', offset = 0): Promise<InventoryItem[]> {
  const search = `%${q.trim().slice(0, 120)}%`,
    values: unknown[] = [search, search, search, search, search];
  let filter =
    '(a.Descripcion LIKE ? OR a.Serie LIKE ? OR e.Folio LIKE ? OR c.Nombre LIKE ? OR a.Ubicacion LIKE ?)';
  if (status !== 'all') {
    if (!['resguardo', 'venta', 'vendido', 'entregado'].includes(status))
      throw new ApiError(400, 'Estado de inventario no válido.');
    filter += ' AND a.Status=?';
    values.push(status);
  }
  values.push(integer(offset, 'Posición', 0));
  return (
    await rows(
      `${INVENTORY_SELECT} WHERE ${filter} ORDER BY a.IdArticulo DESC LIMIT 500 OFFSET ?`,
      values,
    )
  ).map(toInventory);
}
export async function sellArticle(id: number, data: Input, actor: Actor) {
  const amount = money(data.importe, 'Precio de venta', 0.01),
    paymentMethod = method(data.metodo);
  return transaction(async (db) => {
    const cash = await openCash(db),
      article = (
        await rows('SELECT * FROM tblArticulos WHERE IdArticulo=? FOR UPDATE', [id], db)
      )[0];
    if (!article) throw new ApiError(404, 'Artículo no encontrado.');
    if (article.Status !== 'venta')
      throw new ApiError(409, 'Solo puedes vender artículos adjudicados y disponibles para venta.');
    const saleId = (
      await write(
        'INSERT INTO tblVentas (IdArticulo,IdUsuario,IdCaja,Importe,Metodo) VALUES (?,?,?,?,?)',
        [id, actor.id, cash.IdCaja, amount, paymentMethod],
        db,
      )
    ).insertId;
    await write("UPDATE tblArticulos SET Status='vendido' WHERE IdArticulo=?", [id], db);
    if (paymentMethod === 'efectivo')
      await cashMovement(
        db,
        cash,
        actor,
        'entrada',
        amount,
        `Venta · ${String(article.Descripcion).slice(0, 160)}`,
        `V-${saleId}`,
      );
    await audit(db, actor, 'articulo.vender', 'articulo', id, {
      ventaId: saleId,
      importe: amount,
      metodo: paymentMethod,
    });
    return {
      ventaId: saleId,
      articulo: toInventory((await rows(`${INVENTORY_SELECT} WHERE a.IdArticulo=?`, [id], db))[0]),
    };
  });
}
export async function getCash() {
  const [open, history] = await Promise.all([
    rows("SELECT * FROM tblCajas WHERE IdSucursal=1 AND Status='abierta'"),
    rows(
      "SELECT * FROM tblCajas WHERE IdSucursal=1 AND Status='cerrada' ORDER BY IdCaja DESC LIMIT 30",
    ),
  ]);
  const cash = open[0],
    movements = cash
      ? await rows('SELECT * FROM tblMovimientosCaja WHERE IdCaja=? ORDER BY IdMovimiento DESC', [
          cash.IdCaja,
        ])
      : [];
  return {
    caja: cash ? toCash(cash) : null,
    movimientos: movements.map(toMovement),
    historial: history.map(toCash),
  };
}
export async function updateCash(data: Input, actor: Actor) {
  const action = String(data.accion);
  if (!['abrir', 'cerrar', 'movimiento'].includes(action))
    throw new ApiError(400, 'Acción de caja no válida.');
  await transaction(async (db) => {
    if (action === 'abrir') {
      const fund = money(data.fondoInicial, 'Fondo inicial');
      await rows('SELECT IdSucursal FROM tblSucursales WHERE IdSucursal=1 FOR UPDATE', [], db);
      if (
        (
          await rows(
            "SELECT IdCaja FROM tblCajas WHERE IdSucursal=1 AND Status='abierta' FOR UPDATE",
            [],
            db,
          )
        ).length
      )
        throw new ApiError(409, 'Ya hay una caja abierta. Ciérrala antes de abrir otra.');
      const id = (
        await write(
          "INSERT INTO tblCajas (IdUsuario,IdSucursal,FondoInicial,SaldoEsperado,Status) VALUES (?,1,?,?,'abierta')",
          [actor.id, fund, fund],
          db,
        )
      ).insertId;
      await audit(db, actor, 'caja.abrir', 'caja', id, { fondoInicial: fund });
    } else {
      const expectedCashId = integer(data.cajaIdEsperada, 'Caja de la operación');
      const cash = await openCash(db);
      if (Number(cash.IdCaja) !== expectedCashId)
        throw new ApiError(
          409,
          'El turno de caja cambió. Actualiza la pantalla antes de registrar esta operación.',
        );
      if (action === 'cerrar') {
        const counted = money(data.efectivoContado, 'Efectivo contado'),
          difference = roundMoney(counted - Number(cash.SaldoEsperado));
        await write(
          "UPDATE tblCajas SET EfectivoContado=?,Diferencia=?,FechaCierre=NOW(),Status='cerrada' WHERE IdCaja=?",
          [counted, difference, cash.IdCaja],
          db,
        );
        await audit(db, actor, 'caja.cerrar', 'caja', Number(cash.IdCaja), {
          efectivoContado: counted,
          diferencia: difference,
        });
      } else {
        const type = String(data.tipo),
          amount = money(data.importe, 'Importe', 0.01),
          concept = textValue(data.concepto, 'El concepto', 250, true);
        if (type !== 'entrada' && type !== 'salida')
          throw new ApiError(400, 'Selecciona entrada o salida.');
        await cashMovement(db, cash, actor, type, amount, concept, 'MANUAL');
        await audit(db, actor, 'caja.movimiento', 'caja', Number(cash.IdCaja), {
          tipo: type,
          importe: amount,
          concepto: concept,
        });
      }
    }
  });
  return getCash();
}
export async function getConfig(db: DB = pool): Promise<BusinessConfig> {
  const result = Object.fromEntries(
    (await rows('SELECT Clave,Valor FROM tblConfiguracion', [], db)).map((row) => [
      row.Clave,
      row.Valor,
    ]),
  );
  return {
    nombreNegocio: result.nombreNegocio || 'Integra Cash',
    tasaMensual: Number(result.tasaMensual ?? 10),
    plazoDias: Number(result.plazoDias ?? 30),
    porcentajePrestamo: Number(result.porcentajePrestamo ?? 60),
    diasGracia: Number(result.diasGracia ?? 7),
  };
}
export async function updateConfig(data: Input, actor: Actor) {
  admin(actor);
  const config: BusinessConfig = {
    nombreNegocio: textValue(data.nombreNegocio, 'El nombre del negocio', 120, true),
    tasaMensual: money(data.tasaMensual, 'Tasa mensual', 0, 100),
    plazoDias: integer(data.plazoDias, 'Plazo en días', 1, 365),
    porcentajePrestamo: money(data.porcentajePrestamo, 'Porcentaje de préstamo', 1, 100),
    diasGracia: integer(data.diasGracia, 'Días de gracia', 0, 365),
  };
  await transaction(async (db) => {
    for (const [key, value] of Object.entries(config))
      await write(
        'INSERT INTO tblConfiguracion (Clave,Valor) VALUES (?,?) ON DUPLICATE KEY UPDATE Valor=VALUES(Valor)',
        [key, String(value)],
        db,
      );
    await audit(db, actor, 'configuracion.actualizar', 'configuracion', 1, config);
  });
  return config;
}
export async function getPayments(): Promise<(Payment & { folio: string; cliente: string })[]> {
  return (
    await rows(
      'SELECT p.*,e.Folio,c.Nombre Cliente FROM tblPagos p JOIN tblEmpenos e ON e.IdEmpeno=p.IdEmpeno JOIN tblClientes c ON c.IdCliente=e.IdCliente ORDER BY p.IdPago DESC LIMIT 500',
    )
  ).map((row) => ({ ...toPayment(row), folio: row.Folio, cliente: row.Cliente }));
}

async function chartData(): Promise<ChartPoint[]> {
  const start = addDays(today(), -6);
  const [loans, payments] = await Promise.all([
    rows(
      'SELECT DATE(FechaAlta) Dia,SUM(Capital) Importe FROM tblEmpenos WHERE FechaAlta>=? GROUP BY DATE(FechaAlta)',
      [start],
    ),
    rows(
      'SELECT DATE(Fecha) Dia,SUM(Importe) Importe FROM tblPagos WHERE Fecha>=? GROUP BY DATE(Fecha)',
      [start],
    ),
  ]);
  const loanMap = new Map(loans.map((row) => [dateOnly(row.Dia), Number(row.Importe)])),
    paymentMap = new Map(payments.map((row) => [dateOnly(row.Dia), Number(row.Importe)]));
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(start, index);
    return {
      label: new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone: 'UTC' })
        .format(new Date(`${day}T12:00:00Z`))
        .replace('.', ''),
      prestado: loanMap.get(day) ?? 0,
      recuperado: paymentMap.get(day) ?? 0,
    };
  });
}
async function categoriesData() {
  return (
    await rows(
      "SELECT cat.Categoria Nombre,SUM(e.SaldoCapital) Importe FROM tblEmpenos e JOIN tblArticulos a ON a.IdArticulo=e.IdArticulo JOIN tblCategorias cat ON cat.IdCategoria=a.IdCategoria WHERE e.Status='vigente' GROUP BY cat.IdCategoria,cat.Categoria ORDER BY Importe DESC",
    )
  ).map((row) => ({ name: row.Nombre as string, value: Number(row.Importe) }));
}
export async function getDashboard() {
  const current = today(),
    end = addDays(current, 7),
    month = `${current.slice(0, 7)}-01`;
  const [
    metrics,
    paymentMetrics,
    clients,
    cashRows,
    recentRows,
    dueRows,
    activityRows,
    chart,
    categories,
  ] = await Promise.all([
    rows(
      "SELECT COALESCE(SUM(SaldoCapital),0) Capital,COUNT(*) Total,COALESCE(SUM(FechaVencimiento BETWEEN ? AND ?),0) PorVencer FROM tblEmpenos WHERE Status='vigente'",
      [current, end],
    ),
    rows('SELECT COALESCE(SUM(Interes),0) Intereses FROM tblPagos WHERE Fecha>=?', [month]),
    rows('SELECT COUNT(*) Total FROM tblClientes'),
    rows("SELECT * FROM tblCajas WHERE IdSucursal=1 AND Status='abierta'"),
    rows(`${LOAN_SELECT} ORDER BY e.IdEmpeno DESC LIMIT 6`),
    rows(
      `${LOAN_SELECT} WHERE e.Status='vigente' AND e.FechaVencimiento<=? ORDER BY e.FechaVencimiento,e.IdEmpeno LIMIT 8`,
      [end],
    ),
    rows('SELECT * FROM tblMovimientosCaja ORDER BY IdMovimiento DESC LIMIT 6'),
    chartData(),
    categoriesData(),
  ]);
  const cash = cashRows[0] ? toCash(cashRows[0]) : null;
  return {
    metrics: {
      capitalActivo: Number(metrics[0].Capital),
      empenosActivos: Number(metrics[0].Total),
      porVencer: Number(metrics[0].PorVencer),
      cajaDisponible: cash?.saldoEsperado ?? 0,
      interesesMes: Number(paymentMetrics[0].Intereses),
      clientesTotal: Number(clients[0].Total),
    },
    recent: recentRows.map(toLoan),
    dueSoon: dueRows.map(toLoan),
    activity: activityRows.map(toMovement),
    chart,
    categories,
    cash,
  };
}
export async function getReports() {
  const current = today(),
    end = addDays(current, 7);
  const [loanMetrics, paymentMetrics, saleMetrics, chart, categories] = await Promise.all([
    rows(
      "SELECT COALESCE(SUM(Capital),0) Prestado,COALESCE(SUM(CASE WHEN Status='vigente' THEN SaldoCapital ELSE 0 END),0) Cartera,COALESCE(SUM(Status='vigente' AND FechaVencimiento BETWEEN ? AND ?),0) PorVencer,COALESCE(SUM(Status='vigente' AND FechaVencimiento<?),0) Vencidos,COUNT(*) Empenos,COALESCE(SUM(Status='desempenado'),0) Desempenados FROM tblEmpenos",
      [current, end, current],
    ),
    rows(
      'SELECT COALESCE(SUM(Capital),0) Recuperado,COALESCE(SUM(Interes),0) Intereses FROM tblPagos',
    ),
    rows('SELECT COALESCE(SUM(Importe),0) Ventas FROM tblVentas'),
    chartData(),
    categoriesData(),
  ]);
  const loan = loanMetrics[0],
    payment = paymentMetrics[0];
  return {
    prestado: Number(loan.Prestado),
    recuperado: Number(payment.Recuperado),
    intereses: Number(payment.Intereses),
    ventas: Number(saleMetrics[0].Ventas),
    cartera: Number(loan.Cartera),
    porVencer: Number(loan.PorVencer),
    vencidos: Number(loan.Vencidos),
    empenos: Number(loan.Empenos),
    desempenados: Number(loan.Desempenados),
    chart,
    categories,
  };
}
