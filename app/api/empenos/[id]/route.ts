import { api, getLoanDetail, integer } from '@/lib/business';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return api(async () => getLoanDetail(integer((await context.params).id)));
}
