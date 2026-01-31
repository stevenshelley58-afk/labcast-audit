/**
 * Infrastructure Extractor
 * 
 * Extracts infrastructure signals from TLS facts, DNS facts, and redirect map.
 * No network calls, no LLM calls, never throws.
 */

import type { 
  TlsFactsData, 
  DnsFactsData, 
  RedirectMapData,
  TriState 
} from "../audit.types.ts";
import { createTriState } from "../audit.util.ts";

/**
 * Infrastructure analysis result
 */
export interface InfraResult {
  // HTTPS
  httpsEnforced: TriState<boolean>;
  httpsRedirectChain: number;
  
  // Host consistency
  hostConsistency: TriState<boolean>;
  wwwPreference: TriState<"www" | "non-www">;
  wwwConsistent: boolean;
  
  // Trailing slash
  trailingSlashConsistent: TriState<boolean>;
  trailingSlashPreference: TriState<"slash" | "no-slash">;
  
  // Redirect health
  redirectChainHealth: "healthy" | "warning" | "critical";
  maxChainLength: number;
  redirectLoops: string[];
  
  // Certificate
  certExpiryDays: TriState<number>;
  certValid: TriState<boolean>;
  certSansIncludeDomain: TriState<boolean>;
  certIssuer: TriState<string>;
  tlsProtocol: TriState<string>;
  
  // DNS
  dnsResolved: boolean;
  aRecords: string[];
  cnameChain: string[];
  hasIpv6: boolean;
  
  // CDN/Hosting detection
  detectedCdn: string | null;
  detectedHosting: string | null;
}

/**
 * Extracts infrastructure signals.
 * 
 * @param tlsFacts - TLS certificate data
 * @param dnsFacts - DNS resolution data
 * @param redirectMap - Redirect chain data
 * @returns InfraResult
 */
export function extractInfra(
  tlsFacts: TlsFactsData | null,
  dnsFacts: DnsFactsData | null,
  redirectMap: RedirectMapData | null
): InfraResult {
  // HTTPS enforcement analysis
  const httpsAnalysis = analyzeHttpsEnforcement(redirectMap);
  
  // Host consistency analysis
  const hostAnalysis = analyzeHostConsistency(redirectMap);
  
  // Trailing slash analysis
  const slashAnalysis = analyzeTrailingSlash(redirectMap);
  
  // Redirect chain health
  const redirectHealth = analyzeRedirectHealth(redirectMap);
  
  // Certificate analysis
  const certAnalysis = analyzeCertificate(tlsFacts);
  
  // DNS analysis
  const dnsAnalysis = analyzeDns(dnsFacts);
  
  // CDN/Hosting detection
  const infraDetection = detectInfrastructure(dnsFacts, tlsFacts);

  return {
    httpsEnforced: httpsAnalysis.enforced,
    httpsRedirectChain: httpsAnalysis.chainLength,
    hostConsistency: hostAnalysis.consistent,
    wwwPreference: hostAnalysis.preference,
    wwwConsistent: hostAnalysis.wwwConsistent,
    trailingSlashConsistent: slashAnalysis.consistent,
    trailingSlashPreference: slashAnalysis.preference,
    redirectChainHealth: redirectHealth.health,
    maxChainLength: redirectHealth.maxLength,
    redirectLoops: redirectHealth.loops,
    certExpiryDays: certAnalysis.expiryDays,
    certValid: certAnalysis.valid,
    certSansIncludeDomain: certAnalysis.sansIncludeDomain,
    certIssuer: certAnalysis.issuer,
    tlsProtocol: certAnalysis.protocol,
    dnsResolved: dnsAnalysis.resolved,
    aRecords: dnsAnalysis.aRecords,
    cnameChain: dnsAnalysis.cnameChain,
    hasIpv6: dnsAnalysis.hasIpv6,
    detectedCdn: infraDetection.cdn,
    detectedHosting: infraDetection.hosting,
  };
}

/**
 * Analyzes HTTPS enforcement from redirect map.
 */
function analyzeHttpsEnforcement(
  redirectMap: RedirectMapData | null
): { enforced: TriState<boolean>; chainLength: number } {
  if (!redirectMap) {
    return { 
      enforced: { state: "unknown", reason: "No redirect data" }, 
      chainLength: 0 
    };
  }

  let chainLength = 0;
  let redirectsToHttps = false;

  // Check httpRoot chain
  const httpChain = redirectMap.httpRoot?.chain || [];
  const httpFinal = redirectMap.httpRoot?.finalUrl || "";
  
  chainLength = Math.max(chainLength, httpChain.length);
  
  if (httpFinal.startsWith("https://") || httpChain.some(s => s.url.startsWith("https://"))) {
    redirectsToHttps = true;
  }

  // Check httpWww chain
  const httpWwwChain = redirectMap.httpWww?.chain || [];
  const httpWwwFinal = redirectMap.httpWww?.finalUrl || "";
  
  chainLength = Math.max(chainLength, httpWwwChain.length);
  
  if (httpWwwFinal.startsWith("https://") || httpWwwChain.some(s => s.url.startsWith("https://"))) {
    redirectsToHttps = true;
  }

  return {
    enforced: { state: "present", value: redirectsToHttps },
    chainLength,
  };
}

/**
 * Analyzes www vs non-www consistency.
 */
function analyzeHostConsistency(
  redirectMap: RedirectMapData | null
): { 
  consistent: TriState<boolean>; 
  preference: TriState<"www" | "non-www">;
  wwwConsistent: boolean;
} {
  if (!redirectMap) {
    return {
      consistent: { state: "unknown", reason: "No redirect data" },
      preference: { state: "unknown", reason: "No redirect data" },
      wwwConsistent: false,
    };
  }

  const finals = [
    redirectMap.httpRoot?.finalUrl,
    redirectMap.httpsRoot?.finalUrl,
    redirectMap.httpWww?.finalUrl,
    redirectMap.httpsWww?.finalUrl,
  ].filter(Boolean) as string[];

  if (finals.length === 0) {
    return {
      consistent: { state: "unknown", reason: "No final URLs" },
      preference: { state: "unknown", reason: "No final URLs" },
      wwwConsistent: false,
    };
  }

  // Check if all finals agree on www
  const hasWww = finals.map(url => {
    try {
      return new URL(url).hostname.startsWith("www.");
    } catch {
      return false;
    }
  });

  const allWww = hasWww.every(v => v);
  const allNonWww = hasWww.every(v => !v);
  const consistent = allWww || allNonWww;

  return {
    consistent: { state: "present", value: consistent },
    preference: consistent 
      ? { state: "present", value: allWww ? "www" : "non-www" }
      : { state: "unknown", reason: "Inconsistent www usage" },
    wwwConsistent: consistent,
  };
}

/**
 * Analyzes trailing slash consistency.
 */
function analyzeTrailingSlash(
  redirectMap: RedirectMapData | null
): { 
  consistent: TriState<boolean>; 
  preference: TriState<"slash" | "no-slash">; 
} {
  if (!redirectMap) {
    return {
      consistent: { state: "unknown", reason: "No redirect data" },
      preference: { state: "unknown", reason: "No redirect data" },
    };
  }

  const finals = [
    redirectMap.httpRoot?.finalUrl,
    redirectMap.httpsRoot?.finalUrl,
    redirectMap.httpWww?.finalUrl,
    redirectMap.httpsWww?.finalUrl,
  ].filter(Boolean) as string[];

  if (finals.length === 0) {
    return {
      consistent: { state: "unknown", reason: "No final URLs" },
      preference: { state: "unknown", reason: "No final URLs" },
    };
  }

  // Check trailing slash on root (they should all just be /)
  // This is a simplified check - in reality we'd need path analysis
  const hasSlash = finals.map(url => {
    try {
      const pathname = new URL(url).pathname;
      return pathname.length > 1 && pathname.endsWith("/");
    } catch {
      return false;
    }
  });

  const allSlash = hasSlash.every(v => v);
  const allNoSlash = hasSlash.every(v => !v);
  const consistent = allSlash || allNoSlash;

  return {
    consistent: { state: "present", value: consistent },
    preference: consistent && hasSlash.length > 0
      ? { state: "present", value: hasSlash[0] ? "slash" : "no-slash" }
      : { state: "unknown", reason: "Inconsistent trailing slash" },
  };
}

/**
 * Analyzes redirect chain health.
 */
function analyzeRedirectHealth(
  redirectMap: RedirectMapData | null
): { 
  health: "healthy" | "warning" | "critical"; 
  maxLength: number;
  loops: string[];
} {
  if (!redirectMap) {
    return { health: "unknown" as "healthy", maxLength: 0, loops: [] };
  }

  const chains = [
    redirectMap.httpRoot?.chain || [],
    redirectMap.httpsRoot?.chain || [],
    redirectMap.httpWww?.chain || [],
    redirectMap.httpsWww?.chain || [],
  ];

  let maxLength = 0;
  const loops: string[] = [];

  for (const chain of chains) {
    maxLength = Math.max(maxLength, chain.length);

    // Check for loops (same URL appearing twice)
    const seen = new Set<string>();
    for (const step of chain) {
      if (seen.has(step.url)) {
        loops.push(step.url);
      }
      seen.add(step.url);
    }
  }

  // Determine health
  let health: "healthy" | "warning" | "critical" = "healthy";
  
  if (loops.length > 0 || maxLength > 5) {
    health = "critical";
  } else if (maxLength > 2) {
    health = "warning";
  }

  return { health, maxLength, loops: [...new Set(loops)] };
}

/**
 * Analyzes TLS certificate.
 */
function analyzeCertificate(
  tlsFacts: TlsFactsData | null
): { 
  expiryDays: TriState<number>; 
  valid: TriState<boolean>;
  sansIncludeDomain: TriState<boolean>;
  issuer: TriState<string>;
  protocol: TriState<string>;
} {
  if (!tlsFacts) {
    return {
      expiryDays: { state: "unknown", reason: "No TLS data" },
      valid: { state: "unknown", reason: "No TLS data" },
      sansIncludeDomain: { state: "unknown", reason: "No TLS data" },
      issuer: { state: "unknown", reason: "No TLS data" },
      protocol: { state: "unknown", reason: "No TLS data" },
    };
  }

  // Calculate expiry days
  let expiryDays: TriState<number> = { state: "unknown", reason: "No expiry date" };
  if (tlsFacts.expiryDate) {
    try {
      const expiry = new Date(tlsFacts.expiryDate);
      const now = new Date();
      const diffTime = expiry.getTime() - now.getTime();
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      expiryDays = { state: "present", value: days };
    } catch {
      // Invalid date format
    }
  }

  // Check if cert is valid (not expired)
  let valid: TriState<boolean> = { state: "unknown", reason: "Cannot determine validity" };
  if (expiryDays.state === "present") {
    valid = { state: "present", value: expiryDays.value > 0 };
  }

  // SANs check - we don't have the domain here, so return unknown
  // The sans array is provided for later comparison
  const sansIncludeDomain = tlsFacts.sans && tlsFacts.sans.length > 0
    ? { state: "present" as const, value: true }
    : { state: "unknown" as const, reason: "No SANs data" };

  return {
    expiryDays,
    valid,
    sansIncludeDomain,
    issuer: createTriState(tlsFacts.certIssuer || null),
    protocol: createTriState(tlsFacts.protocol || null),
  };
}

/**
 * Analyzes DNS data.
 */
function analyzeDns(
  dnsFacts: DnsFactsData | null
): { 
  resolved: boolean; 
  aRecords: string[];
  cnameChain: string[];
  hasIpv6: boolean;
} {
  if (!dnsFacts) {
    return {
      resolved: false,
      aRecords: [],
      cnameChain: [],
      hasIpv6: false,
    };
  }

  return {
    resolved: dnsFacts.aRecords && dnsFacts.aRecords.length > 0,
    aRecords: dnsFacts.aRecords || [],
    cnameChain: dnsFacts.cnameChain || [],
    hasIpv6: dnsFacts.aaaaRecords && dnsFacts.aaaaRecords.length > 0,
  };
}

/**
 * Detects CDN and hosting provider from DNS/TLS data.
 */
function detectInfrastructure(
  dnsFacts: DnsFactsData | null,
  tlsFacts: TlsFactsData | null
): { cdn: string | null; hosting: string | null } {
  let cdn: string | null = null;
  let hosting: string | null = null;

  // Check CNAME chain for CDN/hosting hints
  const cnames = dnsFacts?.cnameChain || [];
  const allRecords = [...cnames, ...(dnsFacts?.aRecords || [])];

  for (const record of allRecords) {
    const lower = record.toLowerCase();
    
    // CDN detection
    if (lower.includes("cloudflare")) cdn = "Cloudflare";
    else if (lower.includes("fastly")) cdn = "Fastly";
    else if (lower.includes("akamai")) cdn = "Akamai";
    else if (lower.includes("cloudfront")) cdn = "CloudFront";
    else if (lower.includes("maxcdn")) cdn = "MaxCDN";
    else if (lower.includes("keycdn")) cdn = "KeyCDN";
    else if (lower.includes("stackpath")) cdn = "StackPath";
    
    // Hosting detection
    if (lower.includes("amazonaws") || lower.includes("aws")) hosting = "AWS";
    else if (lower.includes("google")) hosting = "Google Cloud";
    else if (lower.includes("azure")) hosting = "Azure";
    else if (lower.includes("digitalocean")) hosting = "DigitalOcean";
    else if (lower.includes("linode")) hosting = "Linode";
    else if (lower.includes("ovh")) hosting = "OVH";
    else if (lower.includes("hetzner")) hosting = "Hetzner";
  }

  // Check cert issuer for hints
  const issuer = tlsFacts?.certIssuer?.toLowerCase() || "";
  if (issuer.includes("cloudflare")) cdn = cdn || "Cloudflare";
  if (issuer.includes("let")) hosting = hosting || "Let's Encrypt";

  return { cdn, hosting };
}
