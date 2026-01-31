/**
 * HTML Sample Collector
 * 
 * Fetches HTML for sampled pages:
 * - Input: array of URLs from sampling plan
 * - For each URL: fetch HTML, record status, headers, final URL
 * - Store HTML body if content-type is html, else null
 * - Use concurrency limit (6)
 */

import type { CollectorOutput, HtmlSamplesData, HtmlSample } from "../audit.types.js";
import { safeFetch, pLimit } from "../audit.util.js";
import { TIMEOUT_HTML_SAMPLE, CONCURRENCY_LIMIT } from "../audit.config.js";

/**
 * Fetches a single HTML sample.
 * 
 * @param url - The URL to fetch
 * @returns HtmlSample object
 */
async function fetchHtmlSample(url: string): Promise<HtmlSample> {
  const result = await safeFetch(url, {
    timeout: TIMEOUT_HTML_SAMPLE,
    followRedirects: true,
  });

  if (result.error || !result.data) {
    return {
      url,
      status: 0,
      headers: {},
      html: "",
    };
  }

  const { url: finalUrl, status, headers, body } = result.data;

  // Only store HTML if content-type indicates HTML
  const contentType = headers["content-type"] || "";
  const isHtml = contentType.toLowerCase().includes("text/html");

  return {
    url: finalUrl,
    status,
    headers,
    html: isHtml ? body : "",
  };
}

/**
 * Collects HTML samples for an array of URLs.
 * 
 * @param urls - Array of URLs to sample
 * @returns CollectorOutput with HtmlSamplesData
 */
export async function collectHtmlSamples(
  urls: string[]
): Promise<CollectorOutput<HtmlSamplesData>> {
  if (!urls || urls.length === 0) {
    return {
      data: { samples: [] },
      error: null,
    };
  }

  try {
    // Create concurrency limiter
    const limit = pLimit(CONCURRENCY_LIMIT);

    // Fetch all URLs with concurrency limit
    const samples = await Promise.all(
      urls.map((url) => limit(() => fetchHtmlSample(url)))
    );

    const data: HtmlSamplesData = {
      samples,
    };

    return { data, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error collecting HTML samples";
    return {
      data: null,
      error: errorMessage,
    };
  }
}
