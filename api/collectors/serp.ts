/**
 * SERP (Search Engine Results Page) Collector
 * 
 * Queries Google for brand + category and site:domain results.
 * Supports SerpApi, DataForSEO, or falls back to error if no API key.
 */

import type { CollectorOutput, SerpRawData } from "../audit.types.ts";
import { TIMEOUT_SERP } from "../audit.config.ts";

/**
 * SERP result item.
 */
interface SerpResult {
  position: number;
  title: string;
  url: string;
  snippet: string;
}

/**
 * Extended SERP data including both query types.
 */
interface SerpDataExtended {
  query: string;
  siteQuery: string;
  results: SerpResult[];
}

/**
 * Extracts brand name from a URL for query construction.
 */
function extractBrandFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    
    // Remove common TLDs and www
    const parts = hostname
      .replace(/^www\./, "")
      .split(".");
    
    // Return the main domain part (usually first part)
    if (parts.length >= 2) {
      return parts[0];
    }
    return parts[0];
  } catch {
    return "";
  }
}

/**
 * Guesses the category based on common URL patterns.
 */
function guessCategory(url: string): string {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes("shop") || lowerUrl.includes("store") || lowerUrl.includes("product")) {
    return "store";
  }
  if (lowerUrl.includes("blog") || lowerUrl.includes("news") || lowerUrl.includes("article")) {
    return "blog";
  }
  if (lowerUrl.includes("service") || lowerUrl.includes("solutions")) {
    return "services";
  }
  if (lowerUrl.includes("app") || lowerUrl.includes("software")) {
    return "software";
  }
  
  return "website";
}

/**
 * Fetches SERP results using SerpApi.
 */
async function fetchSerpApi(
  query: string,
  apiKey: string
): Promise<SerpResult[]> {
  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: apiKey,
    num: "10",
  });

  const response = await fetch(`https://serpapi.com/search?${params.toString()}`, {
    method: "GET",
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`SerpApi HTTP error: ${response.status}`);
  }

  const data = await response.json();
  
  // Extract organic results
  const organicResults = data.organic_results || [];
  
  return organicResults.map((result: { position?: number; title?: string; link?: string; snippet?: string }) => ({
    position: result.position || 0,
    title: result.title || "",
    url: result.link || "",
    snippet: result.snippet || "",
  }));
}

/**
 * Fetches SERP results using DataForSEO.
 */
async function fetchDataForSeo(
  query: string,
  login: string,
  password: string
): Promise<SerpResult[]> {
  const auth = btoa(`${login}:${password}`);
  
  const response = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{
      keyword: query,
      location_code: 2840, // United States
      language_code: "en",
      depth: 10,
    }]),
  });

  if (!response.ok) {
    throw new Error(`DataForSEO HTTP error: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.tasks?.[0]?.result?.[0]?.items) {
    return [];
  }

  const items = data.tasks[0].result[0].items;
  
  return items
    .filter((item: { type: string }) => item.type === "organic")
    .map((item: { rank_group?: number; title?: string; url?: string; description?: string }, index: number) => ({
      position: item.rank_group || index + 1,
      title: item.title || "",
      url: item.url || "",
      snippet: item.description || "",
    }));
}

/**
 * Collects SERP data for a URL.
 * 
 * Queries:
 * 1. brand + category guess
 * 2. site:domain
 * 
 * @param url - The URL to collect SERP data for
 * @returns CollectorOutput with SERP results
 */
export async function collectSerp(
  url: string
): Promise<CollectorOutput<SerpDataExtended>> {
  // Check for API keys
  const serpApiKey = process.env.SERPAPI_KEY;
  const dataForSeoLogin = process.env.DATAFORSEO_LOGIN;
  const dataForSeoPassword = process.env.DATAFORSEO_PASSWORD;

  if (!serpApiKey && !(dataForSeoLogin && dataForSeoPassword)) {
    return {
      data: null,
      error: "No SERP API configured. Set SERPAPI_KEY or DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD environment variables.",
    };
  }

  try {
    const brand = extractBrandFromUrl(url);
    const category = guessCategory(url);
    
    // Build queries
    const brandCategoryQuery = brand ? `${brand} ${category}` : category;
    const siteQuery = `site:${new URL(url).hostname}`;

    // Use brand+category query as primary
    let results: SerpResult[] = [];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_SERP);

    try {
      if (serpApiKey) {
        results = await fetchSerpApi(brandCategoryQuery, serpApiKey);
      } else if (dataForSeoLogin && dataForSeoPassword) {
        results = await fetchDataForSeo(brandCategoryQuery, dataForSeoLogin, dataForSeoPassword);
      }
    } finally {
      clearTimeout(timeoutId);
    }

    return {
      data: {
        query: brandCategoryQuery,
        siteQuery,
        results,
      },
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      data: null,
      error: `SERP collection failed: ${errorMessage}`,
    };
  }
}
