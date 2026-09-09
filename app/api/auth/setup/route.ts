import { NextResponse } from 'next/server';
import { createFirstUser, startSession } from '@/lib/auth';
import { ApiError, handleError, readJson } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (name.length < 2 || name.length > 120)
      throw new ApiError(400, 'Escribe un nombre de 2 a 120 caracteres.');
    if (!/^[a-z0-9._@-]{3,80}$/.test(username))
      throw new ApiError(
        400,
        'El usuario debe tener de 3 a 80 caracteres: letras, números, punto, guion o @.',
      );
    if (
      password.length < 10 ||
      password.length > 200 ||
      !/[a-zA-Z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      throw new ApiError(400, 'Usa una contraseña de al menos 10 caracteres con letras y números.');
    }
    const user = await createFirstUser(name, username, password);
    const response = NextResponse.json({ user }, { status: 201 });
    await startSession(user, response);
    return response;
  } catch (error) {
    return handleError(error);
  }
}
