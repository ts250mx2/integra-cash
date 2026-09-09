import { api, getConfig, updateConfig, body } from '@/lib/business';

export const runtime = 'nodejs';
export async function GET() {
  return api(() => getConfig());
}
export async function PUT(request: Request) {
  return api(async (actor) => updateConfig(await body(request), actor));
}
