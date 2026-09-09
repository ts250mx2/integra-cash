import { NextResponse } from 'next/server';
import { signIn, startSession } from '@/lib/auth';
import { ApiError, handleError, readJson } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[a-z0-9._@-]{3,80}$/i.test(username) || !password || password.length > 200)
      throw new ApiError(400, 'Ingresa tu usuario y contraseña.');
    const user = await signIn(username, password);
    const response = NextResponse.json({ user });
    await startSession(user, response);
    return response;
  } catch (error) {
    return handleError(error);
  }
}
