import { api, getClients, saveClient, body } from '@/lib/business';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return api(() => getClients(params.get('q') ?? '', Number(params.get('offset') ?? 0)));
}
export async function POST(request: Request) {
  return api(async (actor) => saveClient(await body(request), actor), 201);
}
