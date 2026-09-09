import { api, getLoans, createLoan, body } from '@/lib/business';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return api(() =>
    getLoans(
      params.get('q') ?? '',
      params.get('status') ?? 'all',
      Number(params.get('offset') ?? 0),
    ),
  );
}
export async function POST(request: Request) {
  return api(async (actor) => createLoan(await body(request), actor), 201);
}
