import { api } from './http';
import type { Business, Employee, Page } from './types';
export async function listBusinesses(): Promise<Business[]> {
  const results: Business[] = [];
  let page = 1;
  while (true) {
    const data = await api<Page<Business>>(`/api/v1/businesses/?page=${page}`);
    results.push(...data.results);
    if (!data.next) return results;
    page++;
  }
}
export const employeePath = (business: string, employee?: string) => `/api/v1/businesses/${encodeURIComponent(business)}/employees/${employee ? encodeURIComponent(employee) + '/' : ''}`;
export const listEmployees = (business: string, page = 1) => api<Page<Employee>>(`${employeePath(business)}?page=${page}`);
