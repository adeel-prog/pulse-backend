export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message?: string, details?: unknown) {
    if (message === undefined) {
      message = code;
      code = statusCode >= 500 ? "internal_error" : "request_error";
    }
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message = "Resource not found") => new AppError(404, "not_found", message);

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, "unauthorized", message);
  }
}
