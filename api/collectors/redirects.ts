/**
 * Redirects Collector
 * 
 * Fetches 4 start URLs and records full redirect chains:
 * - http://root
 * - https://root
 * - https://www.root
 * - http://www.root
 * Max 10 hops each
 */

import type { CollectorOutput, RedirectMapData, RedirectChain } from "../audit.types.ts";
import { safeFetch } from "../audit.util.ts";
import { TIMEOUT_DEFAULT, MAX_REDIRECT_HOPS } from "../audit.config.ts";

/**
 * Fetches a URL and records the full redirect chain.
 * 
 * @param url - The URL to fetch
 * @returns RedirectChain with chain and finalUrl
 */
async function fetchRedirectChain(url: string): Promise<RedirectChain> {
  const result = await safeFetch(url, {
    timeout: TIMEOUT_DEFAULT,
    followRedirects: true,
    maxRedirects: MAX_REDIRECT_HOPS,
  });

  if (result.error || !result.data) {
    // Return chain with error indication
    return {
      chain: [{ url, status: 0 }],
      finalUrl: url,
    };
  }

  const { redirectChain, url: finalUrl } = result.data;

  // Add the final URL to complete the chain visualization
  const fullChain = [...redirectChain];
  
  // If there were redirects, add the final destination
  if (redirectChain.length > 0) {
    fullChain.push({ url: finalUrl, status: result.data.status });
  }

  return {
    chain: fullChain.length > 0 ? fullChain : [{ url: finalUrl, status: result.data.status }],
    finalUrl,
  };
}

/**
 * Collects redirect chains for all host variants.
 * 
 * @param normalizedUrl - The normalized root URL
 * @returns CollectorOutput with RedirectMapData
 */
export async function collectRedirectMap(
  normalizedUrl: string
): Promise<CollectorOutput<RedirectMapData>> {
  try {
    const rootUrl = new URL(normalizedUrl);
    const hostname = rootUrl.hostname;
    
    // Determine www vs non-www
    let baseHostname = hostname;
    let wwwHostname = hostname;
    
    if (hostname.startsWith("www.")) {
      baseHostname = hostname.slice(4);
      wwwHostname = hostname;
    } else {
      wwwHostname = `www.${hostname}`;
    }

    // Build the 4 test URLs
    const httpRoot = `http://${baseHostname}/`;
    const httpsRoot = `https://${baseHostname}/`;
    const httpsWww = `https://${wwwHostname}/`;
    const httpWww = `http://${wwwHostname}/`;

    // Fetch all 4 variants in parallel
    const [
      httpRootChain,
      httpsRootChain,
      httpsWwwChain,
      httpWwwChain,
    ] = await Promise.all([
      fetchRedirectChain(httpRoot),
      fetchRedirectChain(httpsRoot),
      fetchRedirectChain(httpsWww),
      fetchRedirectChain(httpWww),
    ]);

    const data: RedirectMapData = {
      httpRoot: httpRootChain,
      httpsRoot: httpsRootChain,
      httpsWww: httpsWwwChain,
      httpWww: httpWwwChain,
    };

    return { data, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error collecting redirect map";
    return {
      data: null,
      error: errorMessage,
    };
  }
}
