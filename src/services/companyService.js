/**
 * Employers and company profiles.
 * Backed by `GET /companies`, `GET /companies/:id`.
 */
import { apiClient, withMock } from './apiClient.js';
import { db } from './mockDb.js';
import { delay } from '../utils/delay.js';

/**
 * @param {{ districtId?: string }} [filters]
 * @returns {Promise<import('../models/index.js').Company[]>}
 */
export function listCompanies(filters = {}) {
  return withMock(
    async () => {
      await delay();
      return db.companies.filter((c) => !filters.districtId || c.districtId === filters.districtId);
    },
    () => apiClient.get('/companies', { params: filters }),
  );
}

/** @returns {Promise<import('../models/index.js').Company | null>} */
export function getCompany(companyId) {
  return withMock(
    async () => {
      await delay(200);
      return db.companies.find((c) => c.id === companyId) ?? null;
    },
    () => apiClient.get(`/companies/${companyId}`),
  );
}
