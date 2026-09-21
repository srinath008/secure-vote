import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorMiddleware(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[SecureVote Error]', err.message, err.stack);

  const status = err.statusCode ?? 500;

  // Map known FSM/business error codes to HTTP status codes
  const codeToStatus: Record<string, number> = {
    ALREADY_VOTED:    409,
    ELECTION_CLOSED:  403,
    NO_ELECTION:      404,
    UNAUTHORIZED:     401,
    FORBIDDEN:        403,
    VOTING_TIMEOUT:   403,
  };

  const httpStatus = err.code ? (codeToStatus[err.code] ?? status) : status;

  res.status(httpStatus).json({
    error: err.message || 'Internal server error',
    ...(err.code ? { code: err.code } : {}),
  });
}
