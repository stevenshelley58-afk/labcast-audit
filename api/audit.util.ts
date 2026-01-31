/**
 * SEO Audit System - Utility Functions
 * 
 * Core utilities used across the audit pipeline:
 * - URL normalization
 * - UUID generation
 * - Cache key computation (SHA256)
 * - TriState helpers
 * - safeFetch with timeouts and limits
 * - Concurrency limiter (pLimit)
 */

import {
  MAX_REDIRECT_HOPS,
  MAX_BYTES_PER_FETCH,
  TIMEOUT_DEFAULT,
  USER_AGENT,
} from "./audit.config.js";
import type {
  TriState,
  FetchOptions,
  FetchResult,
} from "./audit.types.js";

// ============================================================================
// URL NORMALIZATION
// ============================================================================

/**
 * Normalizes a URL to its canonical form.
 * - Converts to lowercase
 * - Removes default port numbers
 * - Removes trailing slash (except for root)
 * - Decodes unnecessary percent-encoding
 * 
 * @param url - The URL to normalize
 * @returns Normalized URL string
 */
export function normalizeUrl(url: string): string {
  try {
    // Trim whitespace
    let normalized = url.trim();

    // Add protocol if missing
    if (!normalized.match(/^https?:\/\//i)) {
      normalized = "https://" + normalized;
    }

    // Parse URL
    const parsed = new URL(normalized);

    // Convert hostname to lowercase
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove default port
    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }

    // Normalize pathname (decode percent-encoding where safe)
    try {
      parsed.pathname = decodeURIComponent(parsed.pathname);
    } catch {
      // If decoding fails, keep original
    }

    // Remove trailing slash except for root
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    // Sort search params for consistency
    parsed.searchParams.sort();

    // Remove hash/fragment
    parsed.hash = "";

    return parsed.toString();
  } catch (error) {
    // If URL parsing fails, return original with basic normalization
    return url
      .trim()
      .toLowerCase()
      .replace(/\/+$/, "")
      .replace(/^https?:\/\//i, "https://");
  }
}

// ============================================================================
// UUID GENERATION
// ============================================================================

/**
 * Generates a UUID v4 string.
 * Uses crypto.randomUUID if available, falls back to manual generation.
 * 
 * @returns UUID v4 string
 */
export function generateRunId(): string {
  // Use crypto.randomUUID if available (Node.js 14.17+, modern browsers)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback implementation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// CACHE KEY COMPUTATION
// ============================================================================

/**
 * Computes a SHA256 cache key for an audit run.
 * Combines normalized URL, tool versions, and prompt versions.
 * 
 * @param normalizedUrl - The normalized URL being audited
 * @param toolVersions - Semicolon-separated tool version strings
 * @param promptVersions - Semicolon-separated prompt version strings
 * @returns SHA256 hex string
 */
export async function computeCacheKey(
  normalizedUrl: string,
  toolVersions: string,
  promptVersions: string
): Promise<string> {
  const input = `${normalizedUrl}|${toolVersions}|${promptVersions}`;
  
  // Use crypto.subtle.digest for SHA256 (available in Node.js and browsers)
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  
  let hashBuffer: ArrayBuffer;
  
  if (typeof crypto !== "undefined" && crypto.subtle) {
    hashBuffer = await crypto.subtle.digest("SHA-256", data);
  } else {
    // Node.js fallback using crypto module
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256");
    hash.update(input);
    return hash.digest("hex");
  }
  
  // Convert ArrayBuffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================================
// TRISTATE HELPERS
// ============================================================================

/**
 * Creates a TriState from a value that may be null or undefined.
 * 
 * @param value - The value to wrap
 * @param reason - Optional reason for unknown state
 * @returns TriState<T>
 */
export function createTriState<T>(
  value: T | null | undefined,
  reason?: string
): TriState<T> {
  if (value === null) {
    return { state: "absent" };
  }
  
  if (value === undefined) {
    return { state: "unknown", reason: reason || "Value was undefined" };
  }
  
  return { state: "present", value };
}

/**
 * Helper to check if a TriState is present.
 */
export function isPresent<T>(triState: TriState<T>): triState is { state: "present"; value: T } {
  return triState.state === "present";
}

/**
 * Helper to check if a TriState is absent.
 */
export function isAbsent<T>(triState: TriState<T>): triState is { state: "absent" } {
  return triState.state === "absent";
}

/**
 * Helper to check if a TriState is unknown.
 */
export function isUnknown<T>(triState: TriState<T>): triState is { state: "unknown"; reason?: string } {
  return triState.state === "unknown";
}

/**
 * Gets the value from a TriState, or returns a default.
 */
export function getTriStateValue<T>(triState: TriState<T>, defaultValue: T): T {
  if (triState.state === "present") {
    return triState.value;
  }
  return defaultValue;
}

// ============================================================================
// SAFE FETCH
// ============================================================================

/**
 * Fetch result with redirect chain tracking.
 */
interface InternalFetchResult {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  redirectChain: Array<{ url: string; status: number }>;
}

/**
 * Performs a safe HTTP fetch with:
 * - Configurable timeout (default 8s)
 * - Max bytes limit (2MB default)
 * - Redirect following (max 10 hops)
 * - Error handling (never throws)
 * 
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns FetchResult - never throws
 */
export async function safeFetch(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const {
    timeout = TIMEOUT_DEFAULT,
    maxBytes = MAX_BYTES_PER_FETCH,
    followRedirects = true,
    maxRedirects = MAX_REDIRECT_HOPS,
    headers = {},
    method = "GET",
  } = options;

  const redirectChain: Array<{ url: string; status: number }> = [];
  let currentUrl = url;
  let redirectCount = 0;

  try {
    while (redirectCount <= maxRedirects) {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(currentUrl, {
          method,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            Connection: "keep-alive",
            ...headers,
          },
          signal: controller.signal,
          redirect: "manual", // We handle redirects manually to track chain
        });

        clearTimeout(timeoutId);

        // Handle redirects
        if (
          followRedirects &&
          response.status >= 300 &&
          response.status < 400 &&
          response.headers.get("location")
        ) {
          redirectChain.push({ url: currentUrl, status: response.status });
          
          const location = response.headers.get("location")!;
          currentUrl = new URL(location, currentUrl).toString();
          redirectCount++;
          
          if (redirectCount > maxRedirects) {
            return {
              data: null,
              error: `Exceeded maximum redirect hops (${maxRedirects})`,
            };
          }
          
          continue;
        }

        // Read response body with byte limit
        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength) > maxBytes) {
          return {
            data: null,
            error: `Content length ${contentLength} exceeds max bytes ${maxBytes}`,
          };
        }

        // Read body with size limit
        const body = await readBodyWithLimit(response, maxBytes);

        // Convert headers to record
        const headersRecord: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headersRecord[key] = value;
        });

        const result: InternalFetchResult = {
          url: currentUrl,
          status: response.status,
          headers: headersRecord,
          body,
          redirectChain,
        };

        return { data: result, error: null };
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    }

    return {
      data: null,
      error: `Exceeded maximum redirect hops (${maxRedirects})`,
    };
  } catch (error) {
    let errorMessage = "Unknown fetch error";
    
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = `Request timeout after ${timeout}ms`;
      } else if (error.message.includes("fetch failed")) {
        errorMessage = `Network error: ${error.message}`;
      } else {
        errorMessage = error.message;
      }
    }

    return { data: null, error: errorMessage };
  }
}

/**
 * Reads response body with a byte limit.
 */
async function readBodyWithLimit(
  response: Response,
  maxBytes: number
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      totalBytes += value.length;
      
      if (totalBytes > maxBytes) {
        throw new Error(`Response body exceeds ${maxBytes} bytes`);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Concatenate chunks
  const allChunks = new Uint8Array(totalBytes);
  let position = 0;
  for (const chunk of chunks) {
    allChunks.set(chunk, position);
    position += chunk.length;
  }

  // Decode as UTF-8
  return new TextDecoder().decode(allChunks);
}

// ============================================================================
// CONCURRENCY LIMITER (pLimit)
// ============================================================================

/**
 * Creates a concurrency limiter that limits the number of concurrent operations.
 * Maximum concurrency is 6 (or lower if specified).
 * 
 * @param concurrency - Maximum concurrent operations (max 6)
 * @returns Function to wrap async operations with concurrency limit
 */
export function pLimit(concurrency: number) {
  const maxConcurrency = Math.min(Math.max(1, concurrency), 6);
  const queue: Array<{
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }> = [];
  let activeCount = 0;

  const processQueue = () => {
    if (activeCount >= maxConcurrency || queue.length === 0) {
      return;
    }

    activeCount++;
    const { fn, resolve, reject } = queue.shift()!;

    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        activeCount--;
        processQueue();
      });
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      queue.push({
        fn,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      processQueue();
    });
  };
}

// ============================================================================
// ADDITIONAL UTILITIES
// ============================================================================

/**
 * Sleeps for a specified number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async function with exponential backoff.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelay: number
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Checks if a URL uses HTTPS.
 */
export function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Extracts domain from URL.
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Truncates a string to a maximum length.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + "...";
}
