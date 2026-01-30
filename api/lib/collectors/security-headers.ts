/**
 * Security Headers Collector
 *
 * Analyzes HTTP security headers (HSTS, CSP, X-Frame-Options, etc.)
 * Pure deterministic analysis - no LLM required.
 */

// ============================================================================
// Types
// ============================================================================

export interface SecurityHeadersResult {
  /** Whether HTTPS is properly enforced */
  httpsEnforced: boolean;
  /** HSTS configuration details */
  hsts: {
    present: boolean;
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
    rawValue?: string;
  };
  /** Content Security Policy */
  csp: {
    present: boolean;
    rawValue?: string;
    directives?: string[];
  };
  /** X-Frame-Options */
  xFrameOptions: {
    present: boolean;
    value?: string;
  };
  /** X-Content-Type-Options */
  xContentTypeOptions: {
    present: boolean;
    value?: string;
  };
  /** X-XSS-Protection (deprecated but still checked) */
  xXssProtection: {
    present: boolean;
    value?: string;
  };
  /** Referrer-Policy */
  referrerPolicy: {
    present: boolean;
    value?: string;
  };
  /** Permissions-Policy (formerly Feature-Policy) */
  permissionsPolicy: {
    present: boolean;
    rawValue?: string;
  };
  /** Missing critical headers */
  missingHeaders: string[];
  /** Security score (0-100) */
  score: number;
  /** Recommendations */
  recommendations: string[];
  /** Raw headers for reference */
  rawHeaders: Record<string, string>;
  /** Any errors during collection */
  error?: string;
}

// ============================================================================
// Header Parsing
// ============================================================================

function parseHSTS(value: string): SecurityHeadersResult['hsts'] {
  const result: SecurityHeadersResult['hsts'] = {
    present: true,
    rawValue: value,
  };

  // Parse max-age
  const maxAgeMatch = value.match(/max-age=(\d+)/i);
  if (maxAgeMatch) {
    result.maxAge = parseInt(maxAgeMatch[1], 10);
  }

  // Check for includeSubDomains
  result.includeSubDomains = /includeSubDomains/i.test(value);

  // Check for preload
  result.preload = /preload/i.test(value);

  return result;
}

function parseCSP(value: string): SecurityHeadersResult['csp'] {
  const directives = value
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.length > 0);

  return {
    present: true,
    rawValue: value,
    directives,
  };
}

// ============================================================================
// Main Collector
// ============================================================================

/**
 * Analyze security headers from a headers object
 */
export function analyzeSecurityHeaders(
  headers: Record<string, string>,
  isHttps: boolean
): SecurityHeadersResult {
  const result: SecurityHeadersResult = {
    httpsEnforced: isHttps,
    hsts: { present: false },
    csp: { present: false },
    xFrameOptions: { present: false },
    xContentTypeOptions: { present: false },
    xXssProtection: { present: false },
    referrerPolicy: { present: false },
    permissionsPolicy: { present: false },
    missingHeaders: [],
    score: 0,
    recommendations: [],
    rawHeaders: headers,
  };

  // Normalize header keys to lowercase
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  // HSTS
  const hstsValue = normalizedHeaders['strict-transport-security'];
  if (hstsValue) {
    result.hsts = parseHSTS(hstsValue);
  } else {
    result.missingHeaders.push('Strict-Transport-Security');
    result.recommendations.push(
      'Add Strict-Transport-Security header with max-age of at least 31536000 (1 year)'
    );
  }

  // CSP
  const cspValue =
    normalizedHeaders['content-security-policy'] ||
    normalizedHeaders['content-security-policy-report-only'];
  if (cspValue) {
    result.csp = parseCSP(cspValue);
  } else {
    result.missingHeaders.push('Content-Security-Policy');
    result.recommendations.push(
      'Implement Content-Security-Policy to prevent XSS and injection attacks'
    );
  }

  // X-Frame-Options
  const xfoValue = normalizedHeaders['x-frame-options'];
  if (xfoValue) {
    result.xFrameOptions = { present: true, value: xfoValue };
  } else {
    result.missingHeaders.push('X-Frame-Options');
    result.recommendations.push(
      'Add X-Frame-Options: DENY or SAMEORIGIN to prevent clickjacking'
    );
  }

  // X-Content-Type-Options
  const xctoValue = normalizedHeaders['x-content-type-options'];
  if (xctoValue) {
    result.xContentTypeOptions = { present: true, value: xctoValue };
  } else {
    result.missingHeaders.push('X-Content-Type-Options');
    result.recommendations.push(
      'Add X-Content-Type-Options: nosniff to prevent MIME-type sniffing'
    );
  }

  // X-XSS-Protection (deprecated but still good to check)
  const xxssValue = normalizedHeaders['x-xss-protection'];
  if (xxssValue) {
    result.xXssProtection = { present: true, value: xxssValue };
  }

  // Referrer-Policy
  const refValue = normalizedHeaders['referrer-policy'];
  if (refValue) {
    result.referrerPolicy = { present: true, value: refValue };
  } else {
    result.missingHeaders.push('Referrer-Policy');
    result.recommendations.push(
      'Add Referrer-Policy: strict-origin-when-cross-origin for privacy'
    );
  }

  // Permissions-Policy
  const ppValue =
    normalizedHeaders['permissions-policy'] || normalizedHeaders['feature-policy'];
  if (ppValue) {
    result.permissionsPolicy = { present: true, rawValue: ppValue };
  }

  // Calculate score
  result.score = calculateSecurityScore(result);

  return result;
}

/**
 * Calculate security score based on header presence and configuration
 */
function calculateSecurityScore(result: SecurityHeadersResult): number {
  let score = 0;
  const maxScore = 100;

  // HTTPS (20 points)
  if (result.httpsEnforced) {
    score += 20;
  }

  // HSTS (20 points)
  if (result.hsts.present) {
    score += 10;
    if (result.hsts.maxAge && result.hsts.maxAge >= 31536000) {
      score += 5;
    }
    if (result.hsts.includeSubDomains) {
      score += 3;
    }
    if (result.hsts.preload) {
      score += 2;
    }
  }

  // CSP (20 points)
  if (result.csp.present) {
    score += 15;
    // Bonus for having key directives
    const directives = result.csp.directives?.join(' ') || '';
    if (directives.includes('default-src')) score += 2;
    if (directives.includes('script-src')) score += 2;
    if (directives.includes("'unsafe-inline'")) score -= 2; // Penalty
  }

  // X-Frame-Options (10 points)
  if (result.xFrameOptions.present) {
    score += 10;
  }

  // X-Content-Type-Options (10 points)
  if (result.xContentTypeOptions.present) {
    score += 10;
  }

  // Referrer-Policy (10 points)
  if (result.referrerPolicy.present) {
    score += 10;
  }

  // Permissions-Policy (10 points)
  if (result.permissionsPolicy.present) {
    score += 10;
  }

  return Math.min(Math.max(score, 0), maxScore);
}

// ============================================================================
// Fetch and Analyze
// ============================================================================

/**
 * Fetch headers from a URL and analyze security headers
 */
export async function collectSecurityHeaders(
  url: string,
  timeout: number = 5000
): Promise<SecurityHeadersResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Extract headers
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Check if HTTPS
    const isHttps = url.startsWith('https://');

    return analyzeSecurityHeaders(headers, isHttps);
  } catch (err) {
    clearTimeout(timeoutId);
    const error = err instanceof Error ? err.message : String(err);

    return {
      httpsEnforced: url.startsWith('https://'),
      hsts: { present: false },
      csp: { present: false },
      xFrameOptions: { present: false },
      xContentTypeOptions: { present: false },
      xXssProtection: { present: false },
      referrerPolicy: { present: false },
      permissionsPolicy: { present: false },
      missingHeaders: [],
      score: 0,
      recommendations: [],
      rawHeaders: {},
      error: error.includes('abort') ? 'Timeout' : error,
    };
  }
}
