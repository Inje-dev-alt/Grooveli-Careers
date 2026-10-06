/** Barrel for the service layer — the only data boundary the UI imports from. */
export * as authService from './authService.js';
export * as jobService from './jobService.js';
export * as profileService from './profileService.js';
export * as missionService from './missionService.js';
export * as applicationService from './applicationService.js';
export * as aiService from './aiService.js';
export * as companyService from './companyService.js';
export * as notificationService from './notificationService.js';
export { apiClient, apiConfig, ApiError } from './apiClient.js';
