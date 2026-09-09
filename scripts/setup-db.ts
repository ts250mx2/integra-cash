import { existsSync, readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) loadEnvFile(envPath);

async function main() {
  if (process.env.DB_NAME && process.env.DB_NAME !== 'BDIntegraCash') {
    throw new Error('DB_NAME debe ser BDIntegraCash; no se permite modificar otra base.');
  }
  if (!process.env.DB_HOST || !process.env.DB_USER) {
    throw new Error('Configura DB_HOST, DB_USER y DB_PASSWORD en .env.local.');
  }
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || 3306),
    connectTimeout: 15_000,
    charset: 'utf8mb4',
    multipleStatements: false,
  });
  try {
    await connection.query(
      'CREATE DATABASE IF NOT EXISTS `BDIntegraCash` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    );
    await connection.changeUser({ database: 'BDIntegraCash' });
    const schema = readFileSync(resolve(process.cwd(), 'database/schema.sql'), 'utf8');
    const statements = schema
      .replace(/^\s*--.*$/gm, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) await connection.query(statement);
    const [tables] = await connection.query<RowDataPacket[]>('SHOW TABLES');
    const [users] = await connection.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM tblUsuarios',
    );
    console.log(
      `BDIntegraCash preparada: ${tables.length} tablas. Se conservaron los registros existentes.`,
    );
    console.log(
      Number(users[0].total) === 0
        ? 'Abre la aplicación para crear tu cuenta de administrador.'
        : 'La base ya tiene usuarios; no se modificaron sus credenciales.',
    );
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null;
  console.error(
    code
      ? `No se pudo preparar BDIntegraCash (${code}). Revisa conectividad y permisos de creación.`
      : error instanceof Error
        ? error.message
        : 'Error al preparar la base de datos.',
  );
  process.exitCode = 1;
});
