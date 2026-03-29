/**
 * Typed application errors → consistent HTTP + JSON envelope codes.
 * Services throw these; errorHandler maps them to responses.
 */
export class AppError extends Error {
  /**
   * @param {number} httpStatus
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown> | undefined} details
   */
  constructor(httpStatus, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.httpStatus = httpStatus;
    this.code = code;
    this.details = details;
  }

  static badRequest(code, message, details) {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(code, message) {
    return new AppError(404, code, message);
  }

  static conflict(code, message, details) {
    return new AppError(409, code, message, details);
  }

  /** Unexpected DB / IO failures */
  static internal(message, code = 'INTERNAL_ERROR', details) {
    return new AppError(500, code, message, details);
  }
}
