/**
 * The error contract (handoff §3), the only failure shape the frontend sees.
 *
 * `message` is rendered to users verbatim — write it for a person. `code` is
 * for branching; `details` is never rendered raw.
 */

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(message: string, status = 400, code = 'validation_failed', details: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details: unknown = null) =>
  new ApiError(message, 400, 'validation_failed', details);

export const unauthorized = (message = 'Your session has expired. Sign in again.') =>
  new ApiError(message, 401, 'unauthorized');

export const forbidden = (message = 'You do not have access to that.') =>
  new ApiError(message, 403, 'forbidden');

export const notFound = (message = 'Not found.') =>
  new ApiError(message, 404, 'not_found');

export const conflict = (message: string, details: unknown = null) =>
  new ApiError(message, 409, 'conflict', details);

export const serverError = (
  message = 'Something went wrong on our side. Try again in a moment.',
) => new ApiError(message, 500, 'server_error');

export function toErrorBody(err: ApiError) {
  return { code: err.code, message: err.message, details: err.details };
}
