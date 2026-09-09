import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';
import type { Connection as MysqlConnection } from 'mysql2';

const database = process.env.DB_NAME || 'BDIntegraCash';
if (database !== 'BDIntegraCash') {
  throw new Error('Integra Cash solo puede conectarse a la base BDIntegraCash.');
}

const globalDb = globalThis as unknown as {
  integraCashPool?: Pool;
  integraCashPoolVersion?: number;
};
const poolVersion = 2;
const cachedPool =
  globalDb.integraCashPoolVersion === poolVersion ? globalDb.integraCashPool : undefined;

const pool =
  cachedPool ??
  mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    port: Number(process.env.DB_PORT || 3306),
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    maxIdle: Math.min(2, Math.max(0, Number(process.env.DB_CONNECTION_LIMIT || 10) - 1)),
    idleTimeout: 5_000,
    waitForConnections: true,
    queueLimit: 100,
    connectTimeout: 15_000,
    charset: 'utf8mb4',
    decimalNumbers: true,
    dateStrings: true,
    timezone: '-06:00',
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
  });

if (!cachedPool) {
  pool.on('connection', (connection) => {
    // mysql2 emits the underlying callback connection for this event.
    (connection as unknown as MysqlConnection).query("SET time_zone = '-06:00'", (error) => {
      if (error) connection.destroy();
    });
  });
}

if (process.env.NODE_ENV !== 'production') {
  globalDb.integraCashPool = pool;
  globalDb.integraCashPoolVersion = poolVersion;
}

export async function transaction<T>(fn: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export default pool;
