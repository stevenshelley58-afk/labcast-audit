/**
 * Well-Known Endpoints Collector
 * 
 * Fetches well-known endpoints:
 * - /.well-known/security.txt
 * - /.well-known/assetlinks.json
 * - /.well-known/apple-app-site-association
 * - /apple-app-site-association
 * - /humans.txt
 * 
 * Records status and headers for each, stores bodySnippet (first 2000 bytes).
 */

import type { CollectorOutput, WellKnownData, WellKnownEndpoint } from "../audit.types.ts";
import { safeFetch } from "../audit.util.ts";
import { TIMEOUT_WELL_KNOWN } from "../audit.config.ts";

/**
 * Endpoints to check (paths relative to origin).
 */
const WELL_KNOWN_PATHS = [
  "/.well-known/security.txt",
  "/.well-known/assetlinks.json",
  "/.well-known/apple-app-site-association",
  "/apple-app-site-association",
  "/humans.txt",
];

/**
 * Maximum bytes to store as body snippet.
 */
const BODY_SNIPPET_SIZE = 2000;

/**
 * Fetches a single well-known endpoint.
 * 
 * @param url - The full URL to fetch
 * @returns WellKnownEndpoint or null if failed
 */
async function fetchWellKnownEndpoint(url: string): Promise<WellKnownEndpoint | null> {
  const result = await safeFetch(url, {
    timeout: TIMEOUT_WELL_KNOWN,
    followRedirects: true,
    maxBytes: BODY_SNIPPET_SIZE,
  });

  if (result.error || !result.data) {
    // Return null for failed requests (endpoint doesn't exist or error)
    return null;
  }

  const { status, headers, body } = result.data;

  // Only store snippet if we got a successful response (2xx)
  if (status < 200 || status >= 300) {
    return {
      status,
      headers,
      bodySnippet: "",
    };
  }

  // Truncate body to snippet size
  const bodySnippet = body.slice(0, BODY_SNIPPET_SIZE);

  return {
    status,
    headers,
    bodySnippet,
  };
}

/**
 * Collects data from well-known endpoints.
 * 
 * @param normalizedUrl - The normalized root URL
 * @returns CollectorOutput with WellKnownData
 */
export async function collectWellKnown(
  normalizedUrl: string
): Promise<CollectorOutput<WellKnownData>> {
  try {
    const rootUrl = new URL(normalizedUrl);
    const baseOrigin = `${rootUrl.protocol}//${rootUrl.host}`;

    const data: WellKnownData = {};

    // Fetch all endpoints
    const fetchPromises = WELL_KNOWN_PATHS.map(async (path) => {
      const url = `${baseOrigin}${path}`;
      const result = await fetchWellKnownEndpoint(url);
      
      if (result) {
        // Store with path as key
        data[path] = result;
      }
    });

    await Promise.all(fetchPromises);

    return { data, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error collecting well-known endpoints";
    return {
      data: null,
      error: errorMessage,
    };
  }
}
