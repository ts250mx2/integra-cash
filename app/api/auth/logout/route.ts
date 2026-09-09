import { NextResponse } from 'next/server';
import { endSession } from '@/lib/auth';
import { assertSameOrigin, handleError } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const response = NextResponse.json({ success: true });
    await endSession(response);
    return response;
  } catch (error) {
    return handleError(error);
  }
}
