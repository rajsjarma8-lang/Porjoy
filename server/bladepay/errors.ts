/**
 * BladePay API Error
 * Wraps errors returned by the BladePay gateway or HTTP connection failures.
 */
export class BladePayError extends Error {
  public readonly code: number;
  public readonly statusCode: number;
  public readonly details: unknown;

  constructor(
    message: string,
    code: number = 1,
    statusCode: number = 500,
    details: unknown = null
  ) {
    super(message);
    this.name = 'BladePayError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BladePayError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}
