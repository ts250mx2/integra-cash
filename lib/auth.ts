import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '@/lib/db';
import { ApiError } from '@/lib/http';

export type AuthUser = { id: number; name: string; role: string };
const cookieName = 'integra_cash_session';
const sessionSeconds = 60 * 60 * 12;
const secureCookie =
  process.env.COOKIE_SECURE === 'true' ||
  (process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production');
const cookieOptions = {
  httpOnly: true,
  secure: secureCookie,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: sessionSeconds,
};

type LoginAttempt = { count: number; until: number };
const authGlobal = globalThis as unknown as { integraLoginAttempts?: Map<string, LoginAttempt> };
const attempts = authGlobal.integraLoginAttempts ?? new Map<string, LoginAttempt>();
authGlobal.integraLoginAttempts = attempts;

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await derivePassword(password, salt)).toString('hex')}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, stored] = encoded.split('$');
  if (
    algorithm !== 'scrypt' ||
    !/^[a-f0-9]{32}$/.test(salt || '') ||
    !/^[a-f0-9]{128}$/.test(stored || '')
  )
    return false;
  const actual = await derivePassword(password, salt);
  return timingSafeEqual(Buffer.from(stored, 'hex'), actual);
}

function loginKey(username: string): string {
  return createHash('sha256').update(username.toLowerCase()).digest('hex');
}

function checkLoginLimit(username: string): void {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const key = loginKey(username);
  const attempt = attempts.get(key);
  if (attempt && attempt.count >= 8)
    throw new ApiError(429, 'Demasiados intentos. Espera 15 minutos e inténtalo nuevamente.');
  if (attempts.size >= 10_000 && !attempt)
    throw new ApiError(429, 'Hay demasiados intentos de acceso. Intenta más tarde.');
  // Count before awaiting database/crypto to cover concurrent attempts too.
  attempts.set(key, {
    count: (attempt?.count || 0) + 1,
    until: attempt?.until || now + 15 * 60_000,
  });
}

export async function needsSetup(): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM tblUsuarios');
  return Number(rows[0].total) === 0;
}

export async function getUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT u.IdUsuario AS id, u.Usuario AS name, u.Rol AS role
     FROM tblSesiones s INNER JOIN tblUsuarios u ON u.IdUsuario = s.IdUsuario
     WHERE s.TokenHash = ? AND s.FechaExpiracion > CURRENT_TIMESTAMP AND u.Status = 1 LIMIT 1`,
    [tokenHash(token)],
  );
  return rows.length
    ? { id: Number(rows[0].id), name: String(rows[0].name), role: String(rows[0].role) }
    : null;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getUser();
  if (!user) throw new ApiError(401, 'Inicia sesión para continuar.');
  return user;
}

export async function signIn(username: string, password: string): Promise<AuthUser> {
  checkLoginLimit(username);
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT IdUsuario, Usuario, PasswordHash, Rol FROM tblUsuarios WHERE Login = ? AND Status = 1 LIMIT 1',
    [username],
  );
  const row = rows[0];
  if (!row) {
    await derivePassword(password, '00000000000000000000000000000000');
    throw new ApiError(401, 'Usuario o contraseña incorrectos.');
  }
  if (!(await verifyPassword(password, String(row.PasswordHash))))
    throw new ApiError(401, 'Usuario o contraseña incorrectos.');
  attempts.delete(loginKey(username));
  return { id: Number(row.IdUsuario), name: String(row.Usuario), role: String(row.Rol) };
}

export async function startSession(user: AuthUser, response: NextResponse): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const previous = (await cookies()).get(cookieName)?.value;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (previous)
      await connection.execute('DELETE FROM tblSesiones WHERE TokenHash = ?', [
        tokenHash(previous),
      ]);
    await connection.execute('DELETE FROM tblSesiones WHERE FechaExpiracion <= CURRENT_TIMESTAMP');
    await connection.execute(
      'INSERT INTO tblSesiones (IdUsuario, TokenHash, FechaExpiracion) VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 12 HOUR))',
      [user.id, tokenHash(token)],
    );
    await connection.execute(
      "INSERT INTO tblAuditoria (IdUsuario, Accion, Entidad, IdEntidad, Detalle) VALUES (?, 'inicio_sesion', 'usuarios', ?, 'Acceso autenticado')",
      [user.id, String(user.id)],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  response.cookies.set(cookieName, token, cookieOptions);
}

export async function endSession(response: NextResponse): Promise<void> {
  const token = (await cookies()).get(cookieName)?.value;
  if (token) await pool.execute('DELETE FROM tblSesiones WHERE TokenHash = ?', [tokenHash(token)]);
  response.cookies.set(cookieName, '', { ...cookieOptions, maxAge: 0 });
}

export async function createFirstUser(
  name: string,
  username: string,
  password: string,
): Promise<AuthUser> {
  const passwordHash = await hashPassword(password);
  const connection = await pool.getConnection();
  let locked = false;
  try {
    const [lock] = await connection.query<RowDataPacket[]>(
      "SELECT GET_LOCK('BDIntegraCash:admin-setup', 5) AS acquired",
    );
    if (Number(lock[0].acquired) !== 1)
      throw new ApiError(409, 'La configuración inicial está en proceso. Intenta nuevamente.');
    locked = true;
    await connection.beginTransaction();
    const [users] = await connection.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM tblUsuarios',
    );
    if (Number(users[0].total) > 0)
      throw new ApiError(
        409,
        'La cuenta inicial ya fue creada. Inicia sesión con tus credenciales.',
      );
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO tblUsuarios (Usuario, Login, PasswordHash, Rol, IdSucursal) VALUES (?, ?, ?, 'admin', 1)",
      [name, username, passwordHash],
    );
    await connection.execute(
      "INSERT INTO tblAuditoria (IdUsuario, Accion, Entidad, IdEntidad, Detalle) VALUES (?, 'configuracion_inicial', 'usuarios', ?, 'Creación de administrador inicial')",
      [result.insertId, String(result.insertId)],
    );
    await connection.commit();
    return { id: result.insertId, name, role: 'admin' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    try {
      if (locked) await connection.query("SELECT RELEASE_LOCK('BDIntegraCash:admin-setup')");
    } finally {
      connection.release();
    }
  }
}
