import { api, saveClient, body, integer } from '@/lib/business';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  return api(async (actor) =>
    saveClient(await body(request), actor, integer((await context.params).id)),
  );
}
