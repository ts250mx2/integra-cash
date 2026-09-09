import { api, getPayments } from '@/lib/business';

export const runtime = 'nodejs';
export async function GET() {
  return api(() => getPayments());
}
