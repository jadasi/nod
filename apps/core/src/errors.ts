export type ErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'stale'
  | 'source_unavailable';

const STATUS: Record<ErrorCode, 400 | 401 | 403 | 404 | 409 | 503> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  stale: 409,
  source_unavailable: 503,
};

/** An error whose message is safe and useful to show to the caller. */
export class NodError extends Error {
  readonly httpStatus: 400 | 401 | 403 | 404 | 409 | 503;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.httpStatus = STATUS[code];
  }
}
