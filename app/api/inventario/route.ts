import { api, getInventory } from '@/lib/business';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return api(() =>
    getInventory(
      params.get('q') ?? '',
      params.get('status') ?? 'all',
      Number(params.get('offset') ?? 0),
    ),
  );
}
