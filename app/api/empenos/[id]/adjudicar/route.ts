import { api, adjudicateLoan, integer } from '@/lib/business';
import { assertSameOrigin } from '@/lib/http';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return api(async (actor) => {
    assertSameOrigin(request);
    return adjudicateLoan(integer((await context.params).id), actor);
  });
}
