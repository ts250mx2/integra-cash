import { api, sellArticle, body, integer } from '@/lib/business';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return api(
    async (actor) => sellArticle(integer((await context.params).id), await body(request), actor),
    201,
  );
}
