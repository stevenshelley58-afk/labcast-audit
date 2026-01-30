export type AuditErrorCode =
  | 'INVALID_URL'
  | 'FETCH_FAILED'
  | 'API_ERROR'
  | 'RATE_LIMITED'
  | 'SCREENSHOT_FAILED'
  | 'PARSE_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'CORS_ERROR'
  | 'UNKNOWN';

export class AuditError extends Error {
  code: AuditErrorCode;
  details?: string;
  retryable: boolean;

  constructor(code: AuditErrorCode, message: string, details?: string, retryable = false) {
    super(message);
    this.name = 'AuditError';
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }

  static fromFetchError(error: unknown, url: string): AuditError {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return new AuditError('TIMEOUT', `Request timed out for ${url}`, error.message, true);
      }
      if (error.message.includes('CORS') || error.message.includes('cross-origin')) {
        return new AuditError('CORS_ERROR', `CORS blocked request to ${url}`, error.message, false);
      }
      if (error.message.includes('network') || error.message.includes('fetch')) {
        return new AuditError('NETWORK_ERROR', `Network error fetching ${url}`, error.message, true);
      }
    }
    return new AuditError('FETCH_FAILED', `Failed to fetch ${url}`, String(error), true);
  }

  static invalidUrl(url: string): AuditError {
    return new AuditError('INVALID_URL', `Invalid URL: ${url}`, 'URL must be a valid HTTP or HTTPS URL', false);
  }

  static apiError(message: string, details?: string): AuditError {
    return new AuditError('API_ERROR', message, details, true);
  }

  static rateLimited(): AuditError {
    return new AuditError('RATE_LIMITED', 'Rate limit exceeded. Please wait before trying again.', undefined, true);
  }

  static screenshotFailed(url: string): AuditError {
    return new AuditError('SCREENSHOT_FAILED', `Failed to capture screenshot for ${url}`, undefined, true);
  }

  static parseError(message: string): AuditError {
    return new AuditError('PARSE_ERROR', message, undefined, false);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
    };
  }
}

export function isAuditError(error: unknown): error is AuditError {
  return error instanceof AuditError;
}

export function getErrorMessage(error: unknown): string {
  if (isAuditError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function getUserFriendlyMessage(code: AuditErrorCode): string {
  switch (code) {
    case 'INVALID_URL':
      return 'Please enter a valid website URL (e.g., https://example.com)';
    case 'FETCH_FAILED':
      return 'Unable to access the website. It may be down or blocking requests.';
    case 'API_ERROR':
      return 'Our analysis service encountered an error. Please try again.';
    case 'RATE_LIMITED':
      return 'Too many requests. Please wait a moment and try again.';
    case 'SCREENSHOT_FAILED':
      return 'Could not capture a screenshot. The visual audit may be incomplete.';
    case 'PARSE_ERROR':
      return 'Failed to process the analysis results.';
    case 'TIMEOUT':
      return 'The request took too long. Please try again.';
    case 'NETWORK_ERROR':
      return 'Network connection issue. Check your internet and try again.';
    case 'CORS_ERROR':
      return 'This website blocks cross-origin requests. Some data may be unavailable.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}
