import { NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, message: error.message },
      { status: error.status },
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      {
        error: 'La solicitud no contiene JSON válido.',
        message: 'La solicitud no contiene JSON válido.',
      },
      { status: 400 },
    );
  }
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'UNKNOWN';
  if (code === 'ER_DUP_ENTRY') {
    return NextResponse.json(
      {
        error: 'Este registro ya existe o la operación ya fue procesada.',
        message: 'Este registro ya existe o la operación ya fue procesada.',
      },
      { status: 409 },
    );
  }
  if (
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'PROTOCOL_CONNECTION_LOST',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ER_BAD_DB_ERROR',
      'ER_NO_SUCH_TABLE',
      'ER_ACCESS_DENIED_ERROR',
    ].includes(code)
  ) {
    console.error('[Integra Cash] Database unavailable:', code);
    return NextResponse.json(
      {
        error:
          'No se pudo conectar con la base de datos. Verifica la conexión y ejecuta la preparación de la base.',
        message:
          'No se pudo conectar con la base de datos. Verifica la conexión y ejecuta la preparación de la base.',
      },
      { status: 503 },
    );
  }
  console.error('[Integra Cash] Request failed:', code);
  return NextResponse.json(
    {
      error: 'No pudimos completar la operación. Intenta nuevamente.',
      message: 'No pudimos completar la operación. Intenta nuevamente.',
    },
    { status: 500 },
  );
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin) return;

  // Browsers calculate this header before a reverse proxy rewrites the request URL.
  // It cannot be set by page JavaScript, so it is a reliable signal for our own UI.
  const fetchSite = request.headers.get('sec-fetch-site')?.toLowerCase();
  if (fetchSite === 'same-origin') return;
  if (fetchSite === 'cross-site') throw new ApiError(403, 'Solicitud de origen no permitido.');

  let source: URL;
  try {
    source = new URL(origin);
  } catch {
    throw new ApiError(403, 'Solicitud de origen no permitido.');
  }

  if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password)
    throw new ApiError(403, 'Solicitud de origen no permitido.');

  const requestUrl = new URL(request.url);
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol =
    forwardedProtocol === 'http' || forwardedProtocol === 'https'
      ? `${forwardedProtocol}:`
      : source.protocol;
  const hosts = [
    requestUrl.host,
    request.headers.get('host'),
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim(),
  ].filter((host): host is string => Boolean(host));
  const allowedOrigins = new Set(hosts.map((host) => `${protocol}//${host.toLowerCase()}`));

  const configuredUrl = process.env.APP_URL?.trim();
  if (configuredUrl) {
    try {
      allowedOrigins.add(new URL(configuredUrl).origin.toLowerCase());
    } catch {
      console.error('[Integra Cash] APP_URL no es una URL válida.');
    }
  }

  if (!allowedOrigins.has(source.origin.toLowerCase()))
    throw new ApiError(403, 'Solicitud de origen no permitido.');
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  assertSameOrigin(request);
  const body = await request.json();
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ApiError(400, 'Datos de solicitud no válidos.');
  return body as Record<string, unknown>;
}
