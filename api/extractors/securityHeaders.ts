/**
 * Security Headers Extractor
 * 
 * Analyzes security headers from root fetch and redirect map.
 * Uses TriState for safe access: present (with value), absent, unknown.
 * No network calls, no LLM calls, never throws.
 */

import type { 
  RootFetchData, 
  RedirectMapData, 
  TriState,
  SecurityHeadersMap 
} from "../audit.types.ts";
import { createTriState } from "../audit.util.ts";

/**
 * Security headers analysis result
 */
export interface SecurityHeadersResult {
  headers: SecurityHeadersMap;
  hsts: TriState<string>;
  csp: TriState<string>;
  xFrameOptions: TriState<string>;
  referrerPolicy: TriState<string>;
  permissionsPolicy: TriState<string>;
  contentTypeOptions: TriState<string>;
  xxssProtection: TriState<string>;
  hasHsts: boolean;
  hasCsp: boolean;
  hasXFrame: boolean;
  httpsEnforced: boolean;
}

// Security headers to check
const SECURITY_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
  "x-content-type-options",
  "x-xss-protection",
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
];

/**
 * Extracts and analyzes security headers.
 * 
 * @param rootFetch - Root fetch data with headers
 * @param redirectMap - Redirect map for HTTPS enforcement check
 * @returns SecurityHeadersResult
 */
export function extractSecurityHeaders(
  rootFetch: RootFetchData | null,
  redirectMap: RedirectMapData | null
): SecurityHeadersResult {
  // Default result with unknown states
  const defaultResult: SecurityHeadersResult = {
    headers: {},
    hsts: { state: "unknown", reason: "No root fetch data" },
    csp: { state: "unknown", reason: "No root fetch data" },
    xFrameOptions: { state: "unknown", reason: "No root fetch data" },
    referrerPolicy: { state: "unknown", reason: "No root fetch data" },
    permissionsPolicy: { state: "unknown", reason: "No root fetch data" },
    contentTypeOptions: { state: "unknown", reason: "No root fetch data" },
    xxssProtection: { state: "unknown", reason: "No root fetch data" },
    hasHsts: false,
    hasCsp: false,
    hasXFrame: false,
    httpsEnforced: false,
  };

  if (!rootFetch) {
    return defaultResult;
  }

  try {
    const headers = normalizeHeaders(rootFetch.finalHeaders);
    const result: SecurityHeadersMap = {};

    // Check each security header
    for (const header of SECURITY_HEADERS) {
      const value = headers[header];
      result[header] = createTriState(value || null);
    }

    // Extract specific headers
    const hsts = result["strict-transport-security"];
    const csp = result["content-security-policy"];
    const xFrameOptions = result["x-frame-options"];
    const referrerPolicy = result["referrer-policy"];
    const permissionsPolicy = result["permissions-policy"];
    const contentTypeOptions = result["x-content-type-options"];
    const xxssProtection = result["x-xss-protection"];

    // Check HTTPS enforcement from redirect map
    const httpsEnforced = checkHttpsEnforcement(redirectMap);

    return {
      headers: result,
      hsts,
      csp,
      xFrameOptions,
      referrerPolicy,
      permissionsPolicy,
      contentTypeOptions,
      xxssProtection,
      hasHsts: hsts.state === "present",
      hasCsp: csp.state === "present",
      hasXFrame: xFrameOptions.state === "present",
      httpsEnforced,
    };
  } catch {
    return defaultResult;
  }
}

/**
 * Normalizes header keys to lowercase for consistent lookup.
 */
function normalizeHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const normalized: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(headers || {})) {
    normalized[key.toLowerCase()] = value;
  }
  
  return normalized;
}

/**
 * Checks if HTTPS is enforced via redirects.
 * Returns true if HTTP redirects to HTTPS.
 */
function checkHttpsEnforcement(
  redirectMap: RedirectMapData | null
): boolean {
  if (!redirectMap) {
    return false;
  }

  try {
    // Check httpRoot -> https redirect
    const httpChain = redirectMap.httpRoot?.chain || [];
    const httpFinal = redirectMap.httpRoot?.finalUrl || "";
    
    if (httpChain.length > 0 || httpFinal.startsWith("https://")) {
      // HTTP redirects somewhere
      if (httpFinal.startsWith("https://")) {
        return true;
      }
      // Check if any step redirects to HTTPS
      for (const step of httpChain) {
        if (step.url.startsWith("https://")) {
          return true;
        }
      }
    }

    // Check httpWww -> https redirect
    const httpWwwChain = redirectMap.httpWww?.chain || [];
    const httpWwwFinal = redirectMap.httpWww?.finalUrl || "";
    
    if (httpWwwChain.length > 0 || httpWwwFinal.startsWith("https://")) {
      if (httpWwwFinal.startsWith("https://")) {
        return true;
      }
      for (const step of httpWwwChain) {
        if (step.url.startsWith("https://")) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Gets HSTS max-age value if present.
 */
export function getHstsMaxAge(headerValue: string | null): number | null {
  if (!headerValue) return null;
  
  const match = headerValue.match(/max-age=(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Checks if HSTS includes includeSubDomains directive.
 */
export function hasIncludeSubDomains(headerValue: string | null): boolean {
  if (!headerValue) return false;
  return headerValue.toLowerCase().includes("includesubdomains");
}

/**
 * Checks if HSTS includes preload directive.
 */
export function hasPreload(headerValue: string | null): boolean {
  if (!headerValue) return false;
  return headerValue.toLowerCase().includes("preload");
}

/**
 * Gets CSP directives as a map.
 */
export function parseCspDirectives(
  headerValue: string | null
): Record<string, string[]> {
  if (!headerValue) return {};
  
  const directives: Record<string, string[]> = {};
  const parts = headerValue.split(";");
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    const spaceIndex = trimmed.indexOf(" ");
    if (spaceIndex > 0) {
      const directive = trimmed.slice(0, spaceIndex).toLowerCase();
      const values = trimmed.slice(spaceIndex + 1).split(/\s+/).filter(Boolean);
      directives[directive] = values;
    } else {
      directives[trimmed.toLowerCase()] = [];
    }
  }
  
  return directives;
}
