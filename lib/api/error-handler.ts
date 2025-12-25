import { NextResponse } from "next/server";

export interface ApiError {
  message: string;
  status: number;
  code?: string;
  details?: any;
}

export class ApiErrorResponse extends Error {
  status: number;
  code?: string;
  details?: any;

  constructor(message: string, status: number = 500, code?: string, details?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = "ApiErrorResponse";
  }
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  error: unknown,
  defaultMessage: string = "Internal server error",
  defaultStatus: number = 500
): NextResponse {
  const isProduction = process.env.NODE_ENV === "production";

  // Handle ApiErrorResponse instances
  if (error instanceof ApiErrorResponse) {
    // Log full error details server-side
    console.error(`[API Error] ${error.code || "UNKNOWN"}: ${error.message}`, {
      status: error.status,
      details: error.details,
      ...(isProduction ? {} : { stack: (error as any).stack }),
    });

    // SECURITY: In production, don't expose internal details
    const responseBody: any = {
      error: error.message,
      code: error.code,
    };

    // Only include details in development
    if (!isProduction && error.details) {
      responseBody.details = error.details;
    }

    return NextResponse.json(responseBody, { status: error.status });
  }

  // Handle Error instances
  if (error instanceof Error) {
    // Check for specific error messages that indicate auth/admin errors
    if (error.message.includes("Forbidden: Admin access required")) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }

    if (error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    // Log full error details server-side (including stack in development)
    console.error(`[API Error] ${error.name}: ${error.message}`, {
      ...(isProduction ? {} : { stack: error.stack }),
    });

    // SECURITY: In production, return generic error message
    const errorMessage = isProduction 
      ? defaultMessage 
      : (error.message || defaultMessage);

    return NextResponse.json(
      { error: errorMessage },
      { status: defaultStatus }
    );
  }

  // Handle unknown error types
  console.error("[API Error] Unknown error:", error);
  return NextResponse.json(
    { error: defaultMessage },
    { status: defaultStatus }
  );
}

/**
 * Wraps an API route handler with consistent error handling
 */
export function withErrorHandler<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return createErrorResponse(error);
    }
  };
}

/**
 * Helper functions for common error types
 */
export const ApiErrors = {
  unauthorized: (message: string = "Unauthorized") =>
    new ApiErrorResponse(message, 401, "UNAUTHORIZED"),

  forbidden: (message: string = "Forbidden: Admin access required") =>
    new ApiErrorResponse(message, 403, "FORBIDDEN"),

  notFound: (resource: string = "Resource") =>
    new ApiErrorResponse(`${resource} not found`, 404, "NOT_FOUND"),

  badRequest: (message: string = "Bad request", details?: any) =>
    new ApiErrorResponse(message, 400, "BAD_REQUEST", details),

  validationError: (message: string, details?: any) =>
    new ApiErrorResponse(message, 400, "VALIDATION_ERROR", details),

  conflict: (message: string = "Resource conflict") =>
    new ApiErrorResponse(message, 409, "CONFLICT"),

  internalServerError: (message: string = "Internal server error", details?: any) =>
    new ApiErrorResponse(message, 500, "INTERNAL_SERVER_ERROR", details),

  serviceUnavailable: (message: string = "Service unavailable") =>
    new ApiErrorResponse(message, 503, "SERVICE_UNAVAILABLE"),
};

