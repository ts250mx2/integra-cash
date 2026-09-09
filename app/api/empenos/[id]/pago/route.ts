import { api, payLoan, body, integer } from '@/lib/business';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return api(
    async (actor) => payLoan(integer((await context.params).id), await body(request), actor),
    201,
  );
}
