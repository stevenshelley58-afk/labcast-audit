/**
 * SEO Audit System - Content Redaction
 *
 * Redacts sensitive content before sending to LLM synthesis.
 * Private flags NEVER go to LLM - this ensures security.
 */

/**
 * Redacts all sensitive content from text before LLM processing
 * Chains all redaction helpers in sequence
 */
export function redactSensitiveContent(text: string): string {
  if (!text || typeof text !== "string") {
    return text;
  }

  let redacted = text;
  redacted = redactUrls(redacted);
  redacted = redactTokens(redacted);
  redacted = redactEmails(redacted);
  redacted = redactIps(redacted);
  redacted = redactAroundKeywords(redacted);

  return redacted;
}

/**
 * Removes query strings from URLs to prevent token/secrets leakage
 * Converts: https://example.com/page?token=abc&secret=123
 * To: https://example.com/page
 */
export function redactUrls(text: string): string {
  if (!text) return text;

  // Match URLs with query strings
  // Pattern: protocol://domain/path?query
  const urlPattern = /(https?:\/\/[^\s\"'<>\[\]]+)(\?[^\s\"'<>\[\]]*)/gi;

  return text.replace(urlPattern, (match, urlWithoutQuery) => urlWithoutQuery);
}

/**
 * Redacts tokens and credentials:
 * - Long hex strings (potential API keys/tokens)
 * - JWT patterns (eyJ...)
 * - Base64-looking strings with high entropy
 */
export function redactTokens(text: string): string {
  if (!text) return text;

  let redacted = text;

  // Redact JWT patterns: eyJ... (header.payload.signature)
  // JWTs start with "eyJ" (base64 of {"alg":...})
  const jwtPattern = /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]*)/g;
  redacted = redacted.replace(jwtPattern, "[REDACTED_JWT]");

  // Redact long hex strings (16+ chars) - potential tokens/secrets
  // Matches hex patterns like: a1b2c3d4e5f6... or 0x1234abcd...
  const hexPattern = /\b(?:0x)?[a-f0-9]{16,}\b/gi;
  redacted = redacted.replace(hexPattern, "[REDACTED_HEX]");

  // Redact UUIDs that look like secrets (in specific contexts)
  // Standard UUID pattern but only redact in context
  const secretUuidPattern = /(?:token|secret|key|auth)[=:]\s*["']?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}["']?/gi;
  redacted = redacted.replace(secretUuidPattern, (match) => {
    return match.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i, "[REDACTED_UUID]");
  });

  return redacted;
}

/**
 * Redact strings around sensitive keywords
 * Masks values after: token, secret, apikey, password, auth
 */
function redactAroundKeywords(text: string): string {
  if (!text) return text;

  const sensitiveKeywords = [
    "token",
    "secret",
    "apikey",
    "api_key",
    "password",
    "passwd",
    "auth",
    "authorization",
    "bearer",
    "credential",
    "private_key",
    "access_key",
    "session",
    "csrf",
    "xsrf"
  ];

  let redacted = text;

  // Pattern: keyword[=:]value or "keyword": "value" or 'keyword': 'value'
  // This handles JSON, query params, and config formats
  for (const keyword of sensitiveKeywords) {
    // Match keyword followed by =, :, or whitespace and then a value
    const pattern = new RegExp(
      `(${keyword})\\s*[=:]\\s*["']?([^\\s"',;}\]<>]+)`,
      "gi"
    );

    redacted = redacted.replace(pattern, (match, kw, value) => {
      // Don't redact if value is obviously not a secret (short, common words)
      if (value.length < 4 || ["true", "false", "null", "undefined", "yes", "no"].includes(value.toLowerCase())) {
        return match;
      }
      return `${kw}=[REDACTED]`;
    });
  }

  return redacted;
}

/**
 * Redact email addresses
 */
function redactEmails(text: string): string {
  if (!text) return text;

  // Email pattern: local@domain.tld
  // More permissive pattern to catch various valid emails
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

  return text.replace(emailPattern, "[REDACTED_EMAIL]");
}

/**
 * Redact IP addresses (IPv4 and IPv6)
 */
function redactIps(text: string): string {
  if (!text) return text;

  let redacted = text;

  // IPv4 pattern: xxx.xxx.xxx.xxx (each 0-255)
  // Using word boundaries to avoid matching version numbers
  const ipv4Pattern = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  redacted = redacted.replace(ipv4Pattern, "[REDACTED_IP]");

  // IPv6 pattern (simplified - matches common formats)
  // Matches: ::1, fe80::1, 2001:db8::1, etc.
  const ipv6Pattern = /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b|\b::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}\b|\b[0-9a-fA-F]{1,4}::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}\b/gi;
  redacted = redacted.replace(ipv6Pattern, "[REDACTED_IP]");

  return redacted;
}

/**
 * Heuristic detection for likely secrets
 * Returns true if value appears to be a secret/token
 */
export function isLikelySecret(value: string): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }

  // Too short to be a meaningful secret
  if (value.length < 12) {
    return false;
  }

  let score = 0;

  // Length score (longer = more likely secret)
  if (value.length > 32) score += 2;
  else if (value.length > 20) score += 1;

  // Mixed case
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  if (hasLower && hasUpper) score += 1;

  // Contains numbers
  if (/\d/.test(value)) score += 1;

  // Contains special characters (common in secrets)
  if (/[_\-+=/.]/.test(value)) score += 1;

  // High entropy indicators (base64-like)
  const base64Chars = /[A-Za-z0-9+/=]/.test(value);
  const hexChars = /[a-f0-9]/i.test(value);
  if (base64Chars && !hexChars) score += 1;

  // Looks like a known secret format
  if (/^(sk-|pk-|Bearer\s|Basic\s|eyJ)/i.test(value)) score += 3;

  // Contains suspicious keywords
  const suspicious = ["secret", "token", "key", "password", "credential", "private"];
  if (suspicious.some((word) => value.toLowerCase().includes(word))) score += 2;

  // Threshold for being a likely secret
  return score >= 4;
}

/**
 * Redact a JavaScript object recursively
 * Useful for sanitizing data structures before sending to LLM
 */
export function redactObject<T extends Record<string, unknown>>(obj: T): T {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip private flags entirely - they NEVER go to LLM
    if (key.toLowerCase().includes("private") || key.toLowerCase().includes("secret")) {
      continue;
    }

    if (typeof value === "string") {
      redacted[key] = redactSensitiveContent(value);
    } else if (Array.isArray(value)) {
      redacted[key] = value.map((item) =>
        typeof item === "string" ? redactSensitiveContent(item) :
        typeof item === "object" && item !== null ? redactObject(item as Record<string, unknown>) :
        item
      );
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactObject(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }

  return redacted as T;
}
