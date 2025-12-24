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
  // Handle ApiErrorResponse instances
  if (error instanceof ApiErrorResponse) {
    console.error(`[API Error] ${error.code || "UNKNOWN"}: ${error.message}`, {
      status: error.status,
      details: error.details,
    });

    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      },
      { status: error.status }
    );
  }

  // Handle Error instances
  if (error instanceof Error) {
    // Check for specific error messages that indicate auth/admin errors
    if (error.message.includes("Forbidden: Admin access required") || error.message.includes("Forbidden:")) {
      // Always return the full error message for admin errors to help debug
      return NextResponse.json(
        { 
          error: error.message,
          code: "FORBIDDEN",
        },
        { status: 403 }
      );
    }

    if (error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { 
          error: error.message,
          code: "UNAUTHORIZED",
        },
        { status: 401 }
      );
    }

    // Log full error details server-side
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
      // In production, log full error but return generic message
      console.error(`[API Error] ${error.name}: ${error.message}`, {
        stack: error.stack,
      });
      // Don't expose stack traces or internal error details to clients
      return NextResponse.json(
        { error: defaultMessage },
        { status: defaultStatus }
      );
    } else {
      // In development, show full error details
      console.error(`[API Error] ${error.name}: ${error.message}`, {
        stack: error.stack,
      });
      return NextResponse.json(
        { error: error.message || defaultMessage },
        { status: defaultStatus }
      );
    }
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

  serviceUnavailable: (message: string = "Service unavailable", details?: any) =>
    new ApiErrorResponse(message, 503, "SERVICE_UNAVAILABLE", details),
};

