/**
 * DNS Facts Collector
 * 
 * Resolves DNS records for the domain:
 * - A, AAAA, CNAME records
 * - Records TTL where possible
 * - Records resolver errors
 */

import type { CollectorOutput, DnsFactsData } from "../audit.types.js";
import { TIMEOUT_DNS } from "../audit.config.js";

/**
 * Performs DNS resolution using Node.js dns module.
 * 
 * @param hostname - The hostname to resolve
 * @returns DnsFactsData
 */
async function performDnsResolution(hostname: string): Promise<DnsFactsData> {
  const { promises: dns } = await import("node:dns");
  
  const aRecords: string[] = [];
  const aaaaRecords: string[] = [];
  const cnameChain: string[] = [];
  const errors: string[] = [];
  let ttl = 0;

  // Resolve A records
  try {
    const aResult = await dns.resolve4(hostname, { ttl: true });
    for (const entry of aResult) {
      aRecords.push(entry.address);
      if (entry.ttl && entry.ttl > ttl) {
        ttl = entry.ttl;
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "A record resolution failed";
    errors.push(`A record: ${msg}`);
  }

  // Resolve AAAA records
  try {
    const aaaaResult = await dns.resolve6(hostname, { ttl: true });
    for (const entry of aaaaResult) {
      aaaaRecords.push(entry.address);
      if (entry.ttl && entry.ttl > ttl) {
        ttl = entry.ttl;
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "AAAA record resolution failed";
    errors.push(`AAAA record: ${msg}`);
  }

  // Resolve CNAME chain
  try {
    const cnameResult = await dns.resolveCname(hostname);
    cnameChain.push(...cnameResult);
  } catch {
    // CNAME resolution may fail if no CNAME exists - this is normal
  }

  return {
    aRecords,
    aaaaRecords,
    cnameChain,
    ttl,
    errors,
  };
}

/**
 * Collects DNS facts for the domain.
 * 
 * @param normalizedUrl - The normalized root URL
 * @returns CollectorOutput with DnsFactsData
 */
export async function collectDnsFacts(
  normalizedUrl: string
): Promise<CollectorOutput<DnsFactsData>> {
  try {
    const url = new URL(normalizedUrl);
    const hostname = url.hostname;

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`DNS resolution timeout after ${TIMEOUT_DNS}ms`)), TIMEOUT_DNS);
    });

    // Race between DNS resolution and timeout
    const data = await Promise.race([
      performDnsResolution(hostname),
      timeoutPromise,
    ]);

    return { data, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown DNS error";
    return {
      data: null,
      error: errorMessage,
    };
  }
}
