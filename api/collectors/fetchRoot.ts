/**
 * Root Fetch Collector
 * 
 * Fetches the normalized URL, follows redirects, and captures:
 * - Full redirect chain (max 10 hops)
 * - Final status and headers
 * - HTML body if content-type is html
 */

import type { CollectorOutput, RootFetchData } from "../audit.types.ts";
import { safeFetch } from "../audit.util.ts";
import { TIMEOUT_ROOT_FETCH } from "../audit.config.ts";

/**
 * Fetches the root URL and captures redirect chain, status, headers, and HTML.
 * 
 * @param normalizedUrl - The normalized URL to fetch
 * @returns CollectorOutput with RootFetchData
 */
export async function collectRootFetch(
  normalizedUrl: string
): Promise<CollectorOutput<RootFetchData>> {
  const result = await safeFetch(normalizedUrl, {
    timeout: TIMEOUT_ROOT_FETCH,
    followRedirects: true,
  });

  if (result.error || !result.data) {
    return {
      data: null,
      error: result.error || "Failed to fetch root URL",
    };
  }

  const { redirectChain, url, status, headers, body } = result.data;

  // Determine if content is HTML
  const contentType = headers["content-type"] || "";
  const isHtml = contentType.toLowerCase().includes("text/html");

  const data: RootFetchData = {
    redirectChain,
    finalStatus: status,
    finalHeaders: headers,
    html: isHtml ? body : "",
  };

  return { data, error: null };
}
