import { api, getCash, updateCash, body } from '@/lib/business';

export const runtime = 'nodejs';
export async function GET() {
  return api(() => getCash());
}
export async function POST(request: Request) {
  return api(async (actor) => updateCash(await body(request), actor));
}
