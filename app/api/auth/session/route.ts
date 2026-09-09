import { NextResponse } from 'next/server';
import { getUser, needsSetup } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const [user, setup] = await Promise.all([getUser(), needsSetup()]);
    return NextResponse.json(
      { user, needsSetup: setup },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return handleError(error);
  }
}
