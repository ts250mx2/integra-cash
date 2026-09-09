/** Integration check against connection-local temporary copies of the schema.
 * No operational table is written. Writes are also rolled back before disconnect. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pool from '../lib/db';
import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import {
  addDays,
  adjudicateLoan,
  createLoan,
  getCash,
  getLoan,
  getLoanDetail,
  payLoan,
  saveClient,
  sellArticle,
  today,
  updateCash,
} from '../lib/business';

async function main() {
  const connection = await pool.getConnection();
  const originalQuery = pool.query.bind(pool),
    originalGetConnection = pool.getConnection.bind(pool);
  let checks = 0;
  const check = (condition: unknown, message: string) => {
    assert.ok(condition, message);
    checks++;
  };
  try {
    const seedTables = ['tblSucursales', 'tblCategorias', 'tblConfiguracion'];
    const seed = new Map<string, RowDataPacket[]>();
    for (const table of seedTables) {
      const [result] = await connection.query<RowDataPacket[]>(`SELECT * FROM ${table}`);
      seed.set(table, result);
    }
    // Temporary tables shadow persistent names for this connection only.
    const tables = [
      'tblSucursales',
      'tblUsuarios',
      'tblSesiones',
      'tblClientes',
      'tblCategorias',
      'tblArticulos',
      'tblEmpenos',
      'tblPagos',
      'tblCajas',
      'tblMovimientosCaja',
      'tblVentas',
      'tblConfiguracion',
      'tblAuditoria',
    ];
    for (const table of tables) {
      const [definition] = await connection.query<RowDataPacket[]>(
        `SHOW CREATE TABLE BDIntegraCash.${table}`,
      );
      // InnoDB temporary tables do not support foreign keys; persistent FK schema is unchanged.
      const ddl = String(definition[0]['Create Table'])
        .replace('CREATE TABLE', 'CREATE TEMPORARY TABLE')
        .split('\n')
        .filter((line) => !/^\s*CONSTRAINT .* FOREIGN KEY/.test(line))
        .join('\n')
        .replace(/,\n\)/g, '\n)');
      await connection.query(ddl);
    }
    for (const [table, records] of seed)
      for (const record of records) {
        const columns = Object.keys(record).filter((key) => record[key] !== undefined);
        await connection.query(
          `INSERT INTO ${table} (${columns.map((c) => `\`${c}\``).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          columns.map((c) => record[c]),
        );
      }
    await connection.beginTransaction();
    const [before] = await connection.query<RowDataPacket[]>(
      'SELECT (SELECT COUNT(*) FROM tblClientes) Clientes,(SELECT COUNT(*) FROM tblEmpenos) Empenos,(SELECT COUNT(*) FROM tblCajas) Cajas',
    );
    // This proxy prevents transaction() from committing the outer transaction.
    const testConnection = new Proxy(connection, {
      get(target, property) {
        if (property === 'beginTransaction')
          return () => target.query('SAVEPOINT integra_cash_verification');
        if (property === 'commit')
          return () => target.query('RELEASE SAVEPOINT integra_cash_verification');
        if (property === 'rollback')
          return () => target.query('ROLLBACK TO SAVEPOINT integra_cash_verification');
        if (property === 'release') return () => undefined;
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as PoolConnection;
    pool.getConnection = async () => testConnection;
    pool.query = connection.query.bind(connection) as typeof pool.query;
    const [user] = await connection.execute<ResultSetHeader>(
      "INSERT INTO tblUsuarios (Usuario,Login,PasswordHash,Rol,IdSucursal,Status) VALUES (?,?,?,'admin',1,1)",
      ['Verificación transaccional', `verify_${randomUUID().slice(0, 12)}`, 'unusable-test-hash'],
    );
    const actor = { id: user.insertId, name: 'Verificación transaccional', role: 'admin' };
    await updateCash({ accion: 'abrir', fondoInicial: 10000 }, actor);
    let cash = (await getCash()).caja!;
    check(cash.saldoEsperado === 10000, 'Apertura');
    await assert.rejects(updateCash({ accion: 'abrir', fondoInicial: 1000 }, actor));
    checks++;
    const client = await saveClient(
      {
        nombre: 'Cliente de verificación temporal',
        telefono: '5551234567',
        identificacion: 'TEST-NO-REAL',
      },
      actor,
    );
    const [category] = await connection.query<RowDataPacket[]>(
      'SELECT IdCategoria FROM tblCategorias ORDER BY IdCategoria LIMIT 1',
    );
    const article = {
      categoriaId: category[0].IdCategoria,
      descripcion: 'Garantía de verificación temporal',
      condicion: 'Bueno',
      ubicacion: 'TEST',
      avaluo: 2000,
    };
    let loan = await createLoan(
      { clienteId: client.id, articulo: article, capital: 1000, tasaInteres: 10, plazoDias: 30 },
      actor,
    );
    check(loan.interes === 100 && loan.totalDesempeno === 1100, 'Cotización');
    check((await getCash()).caja?.saldoEsperado === 9000, 'Salida por préstamo');
    await assert.rejects(
      createLoan(
        {
          clienteId: client.id,
          articulo: { ...article, avaluo: 20000 },
          capital: 20000,
          tasaInteres: 10,
          plazoDias: 30,
        },
        actor,
      ),
    );
    checks++;
    check((await getCash()).caja?.saldoEsperado === 9000, 'Rollback de fondos insuficientes');
    const quote = () => ({
      saldoCapitalEsperado: loan.saldoCapital,
      fechaVencimientoEsperada: loan.fechaVencimiento,
    });
    loan = (
      await payLoan(
        loan.id,
        { tipo: 'abono', importe: 200, metodo: 'transferencia', ...quote() },
        actor,
      )
    ).loan;
    check(loan.saldoCapital === 800 && loan.interes === 100, 'Abono conserva interés del plazo');
    check((await getCash()).caja?.saldoEsperado === 9000, 'Transferencia no afecta efectivo');
    const stale = quote();
    loan = (
      await payLoan(
        loan.id,
        { tipo: 'refrendo', importe: 100, metodo: 'efectivo', ...quote() },
        actor,
      )
    ).loan;
    check(loan.refrendos === 1 && loan.interes === 80, 'Refrendo y nueva base de interés');
    await assert.rejects(
      payLoan(loan.id, { tipo: 'refrendo', importe: 100, metodo: 'efectivo', ...stale }, actor),
    );
    checks++;
    loan = (
      await payLoan(
        loan.id,
        { tipo: 'desempeno', importe: 880, metodo: 'efectivo', ...quote() },
        actor,
      )
    ).loan;
    check(loan.status === 'desempenado' && loan.saldoCapital === 0, 'Desempeño');
    check(
      (await getLoanDetail(loan.id)).articuloDetalle.status === 'entregado',
      'Entrega de garantía',
    );
    await assert.rejects(
      payLoan(
        loan.id,
        {
          tipo: 'desempeno',
          importe: 880,
          metodo: 'efectivo',
          saldoCapitalEsperado: 800,
          fechaVencimientoEsperada: loan.fechaVencimiento,
        },
        actor,
      ),
    );
    checks++;
    check((await getCash()).caja?.saldoEsperado === 9980, 'Efectivo después de pagos');
    const second = await createLoan(
      { clienteId: client.id, articulo: article, capital: 500, tasaInteres: 10, plazoDias: 30 },
      actor,
    );
    await assert.rejects(adjudicateLoan(second.id, actor));
    checks++;
    await connection.execute('UPDATE tblEmpenos SET FechaVencimiento=? WHERE IdEmpeno=?', [
      addDays(today(), -400),
      second.id,
    ]);
    await adjudicateLoan(second.id, actor);
    check((await getLoan(second.id)).status === 'adjudicado', 'Adjudicación después de gracia');
    await sellArticle(second.articuloId, { importe: 700, metodo: 'efectivo' }, actor);
    await assert.rejects(
      sellArticle(second.articuloId, { importe: 700, metodo: 'efectivo' }, actor),
    );
    checks++;
    check((await getCash()).caja?.saldoEsperado === 10180, 'Venta y protección de doble venta');
    await updateCash(
      {
        accion: 'movimiento',
        cajaIdEsperada: cash.id,
        tipo: 'salida',
        importe: 180,
        concepto: 'Verificación de salida',
      },
      actor,
    );
    cash = (await getCash()).caja!;
    check(cash.saldoEsperado === 10000, 'Movimiento de caja');
    await assert.rejects(
      updateCash(
        { accion: 'cerrar', cajaIdEsperada: cash.id + 1000, efectivoContado: 10000 },
        actor,
      ),
    );
    checks++;
    await updateCash({ accion: 'cerrar', cajaIdEsperada: cash.id, efectivoContado: 10000 }, actor);
    const final = await getCash();
    check(
      !final.caja && final.historial.find((c) => c.id === cash.id)?.diferencia === 0,
      'Corte sin diferencia',
    );
    await connection.rollback();
    const [after] = await connection.query<RowDataPacket[]>(
      'SELECT (SELECT COUNT(*) FROM tblClientes) Clientes,(SELECT COUNT(*) FROM tblEmpenos) Empenos,(SELECT COUNT(*) FROM tblCajas) Cajas',
    );
    assert.deepEqual(after[0], before[0]);
    checks++;
    console.log(
      `${checks} verificaciones de MySQL correctas en tablas temporales aisladas. ROLLBACK confirmado; tablas operativas intactas.`,
    );
  } finally {
    pool.query = originalQuery;
    pool.getConnection = originalGetConnection;
    await connection.rollback();
    connection.release();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falló la verificación.');
  process.exitCode = 1;
});
