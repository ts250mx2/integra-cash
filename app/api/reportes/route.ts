import { api, getReports } from '@/lib/business';

export const runtime = 'nodejs';
export async function GET() {
  return api(() => getReports());
}
