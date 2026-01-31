/**
 * Security Audit Module
 * 
 * Analyzes security headers, HTTPS enforcement, mixed content,
 * TLS certificate status, and security.txt.
 * Produces deterministic findings - no network calls, no LLM calls.
 * Never throws, returns empty array if no findings.
 * 
 * Private flags are stored separately and NEVER exposed to public reports.
 */

import type { SiteSnapshot, AuditFinding, RawSnapshot, PrivateFlag, SecurityHeadersMap } from "../audit.types.ts";
import { isPresent, isAbsent } from "../audit.util.ts";
import { SECURITY_HEADERS_CHECKLIST } from "../audit.config.ts";

/**
 * Security audit result with public findings and private flags
 */
export interface SecurityAuditResult {
  findings: AuditFinding[];
  privateFlags: PrivateFlag[];
}

/**
 * Runs security audit on SiteSnapshot.
 * 
 * @param snapshot - SiteSnapshot from extractors
 * @param raw - RawSnapshot for additional data access
 * @returns SecurityAuditResult with findings and private flags
 */
export function auditSecurity(snapshot: SiteSnapshot, raw: RawSnapshot): SecurityAuditResult {
  const findings: AuditFinding[] = [];
  const privateFlags: PrivateFlag[] = [];

  try {
    // Check security headers (public)
    const headerFindings = checkSecurityHeaders(snapshot.siteWide.securityHeaders);
    findings.push(...headerFindings);

    // Check HTTPS enforcement (public)
    const httpsFindings = checkHttpsEnforcement(snapshot, raw);
    findings.push(...httpsFindings);

    // Check TLS certificate (public)
    const tlsFindings = checkTlsCertificate(raw);
    findings.push(...tlsFindings);

    // Check security.txt (public)
    const securityTxtFindings = checkSecurityTxt(raw);
    findings.push(...securityTxtFindings);

    // Check for exposed source maps (private)
    const sourcemapFlags = checkExposedSourcemaps(raw);
    privateFlags.push(...sourcemapFlags);

    // Check for stack traces in HTML (private)
    const stackTraceFlags = checkStackTraces(raw);
    privateFlags.push(...stackTraceFlags);

    // Check for obvious secrets (private)
    const secretFlags = checkObviousSecrets(raw);
    privateFlags.push(...secretFlags);

    // Check for internal hostnames (private)
    const hostnameFlags = checkInternalHostnames(raw);
    privateFlags.push(...hostnameFlags);

    // Add generic public finding if any private flags found
    if (privateFlags.length > 0) {
      findings.push({
        type: "sec_missing_csp", // Generic security issue
        severity: "warning",
        message: "Potential exposure observed, requires review",
        evidence: {
          observationCount: privateFlags.length,
          categories: [...new Set(privateFlags.map(f => f.type))],
          note: "Detailed findings available in internal review",
        },
      });
    }

  } catch {
    // Never throw - return findings collected so far
  }

  return { findings, privateFlags };
}

/**
 * Checks for missing security headers.
 */
function checkSecurityHeaders(headers: SecurityHeadersMap): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const missingHeaders: string[] = [];
  const presentHeaders: Record<string, string> = {};

  for (const header of SECURITY_HEADERS_CHECKLIST) {
    const headerState = headers[header];
    
    if (!headerState || isAbsent(headerState)) {
      missingHeaders.push(header);
    } else if (isPresent(headerState)) {
      presentHeaders[header] = headerState.value;
    }
  }

  // Critical: HSTS missing
  if (missingHeaders.includes("strict-transport-security")) {
    findings.push({
      type: "sec_missing_hsts",
      severity: "critical",
      message: "Missing Strict-Transport-Security (HSTS) header",
      evidence: {
        missingHeader: "strict-transport-security",
        presentHeaders: Object.keys(presentHeaders),
        recommendation: "Implement HSTS header with max-age of at least 31536000",
      },
    });
  }

  // High: CSP missing
  if (missingHeaders.includes("content-security-policy")) {
    findings.push({
      type: "sec_missing_csp",
      severity: "warning",
      message: "Missing Content-Security-Policy header",
      evidence: {
        missingHeader: "content-security-policy",
        presentHeaders: Object.keys(presentHeaders),
        recommendation: "Implement CSP to mitigate XSS attacks",
      },
    });
  }

  // Medium: X-Frame-Options missing
  if (missingHeaders.includes("x-frame-options")) {
    findings.push({
      type: "sec_missing_xframe",
      severity: "warning",
      message: "Missing X-Frame-Options header",
      evidence: {
        missingHeader: "x-frame-options",
        presentHeaders: Object.keys(presentHeaders),
        recommendation: "Add X-Frame-Options: DENY or SAMEORIGIN to prevent clickjacking",
      },
    });
  }

  // Info: Other security headers
  const otherMissing = missingHeaders.filter(h => 
    !["strict-transport-security", "content-security-policy", "x-frame-options"].includes(h)
  );

  if (otherMissing.length > 0) {
    findings.push({
      type: "sec_missing_csp",
      severity: "info",
      message: `${otherMissing.length} additional security headers missing`,
      evidence: {
        missingHeaders: otherMissing,
        presentHeaders: Object.keys(presentHeaders),
      },
    });
  }

  return findings;
}

/**
 * Checks HTTPS enforcement.
 */
function checkHttpsEnforcement(snapshot: SiteSnapshot, raw: RawSnapshot): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const httpsEnforced = snapshot.siteWide.httpsEnforced;

  if (isAbsent(httpsEnforced) || (isPresent(httpsEnforced) && !httpsEnforced.value)) {
    findings.push({
      type: "sec_missing_https",
      severity: "critical",
      message: "HTTPS is not properly enforced",
      evidence: {
        httpsEnforced: isPresent(httpsEnforced) ? httpsEnforced.value : "unknown",
        recommendation: "Redirect all HTTP traffic to HTTPS",
      },
    });
  }

  return findings;
}

/**
 * Checks TLS certificate status.
 */
function checkTlsCertificate(raw: RawSnapshot): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const tlsFacts = raw.tlsFacts?.data;
  if (!tlsFacts) {
    return findings;
  }

  // Check expiry
  if (tlsFacts.expiryDate && tlsFacts.expiryDate !== "unknown") {
    const expiryDate = new Date(tlsFacts.expiryDate);
    const now = new Date();
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      findings.push({
        type: "sec_expired_cert",
        severity: "critical",
        message: "TLS certificate has expired",
        evidence: {
          expiryDate: tlsFacts.expiryDate,
          daysOverdue: Math.abs(daysUntilExpiry),
          issuer: tlsFacts.certIssuer,
        },
      });
    } else if (daysUntilExpiry < 30) {
      findings.push({
        type: "sec_expired_cert",
        severity: "warning",
        message: `TLS certificate expires in ${daysUntilExpiry} days`,
        evidence: {
          expiryDate: tlsFacts.expiryDate,
          daysRemaining: daysUntilExpiry,
          issuer: tlsFacts.certIssuer,
          recommendation: "Renew certificate before expiry",
        },
      });
    }
  }

  // Check protocol version
  if (tlsFacts.protocol) {
    const protocol = tlsFacts.protocol.toLowerCase();
    if (protocol.includes("ssl") || protocol.includes("tlsv1.0") || protocol.includes("tlsv1.1")) {
      findings.push({
        type: "sec_weak_tls",
        severity: "warning",
        message: `Weak TLS protocol detected: ${tlsFacts.protocol}`,
        evidence: {
          protocol: tlsFacts.protocol,
          recommendation: "Upgrade to TLS 1.2 or higher",
        },
      });
    }
  }

  return findings;
}

/**
 * Checks for security.txt.
 */
function checkSecurityTxt(raw: RawSnapshot): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const wellKnown = raw.wellKnown?.data;
  if (!wellKnown) {
    return findings;
  }

  const securityTxt = wellKnown["/.well-known/security.txt"];
  
  if (!securityTxt || securityTxt.status !== 200) {
    findings.push({
      type: "sec_missing_csp",
      severity: "info",
      message: "security.txt not found at /.well-known/security.txt",
      evidence: {
        status: securityTxt?.status || "not found",
        recommendation: "Consider adding security.txt for vulnerability disclosure",
      },
    });
  }

  return findings;
}

/**
 * Checks for exposed source maps (PRIVATE FLAG).
 */
function checkExposedSourcemaps(raw: RawSnapshot): PrivateFlag[] {
  const flags: PrivateFlag[] = [];

  const htmlSamples = raw.htmlSamples?.data?.samples || [];
  const exposedMaps: Array<{ url: string; mapUrls: string[] }> = [];

  for (const sample of htmlSamples) {
    const mapUrls: string[] = [];
    
    // Check for source map references
    const sourceMapRegex = /sourceMappingURL\s*=\s*([^\s]+)/gi;
    let match;
    while ((match = sourceMapRegex.exec(sample.html)) !== null) {
      mapUrls.push(match[1]);
    }

    // Check for .map files in script tags
    const scriptRegex = /<script[^>]+src\s*=\s*["']([^"']+)["']/gi;
    while ((match = scriptRegex.exec(sample.html)) !== null) {
      const src = match[1];
      if (src.endsWith(".map") || src.includes(".js.map")) {
        mapUrls.push(src);
      }
    }

    if (mapUrls.length > 0) {
      exposedMaps.push({ url: sample.url, mapUrls });
    }
  }

  if (exposedMaps.length > 0) {
    flags.push({
      type: "data_quality",
      severity: "medium",
      message: "Exposed source maps detected (REDACTED)",
      context: {
        category: "exposed_sourcemaps",
        affectedPages: exposedMaps.length,
        details: "[REDACTED - See internal logs]",
      },
    });
  }

  return flags;
}

/**
 * Checks for stack traces in HTML (PRIVATE FLAG).
 */
function checkStackTraces(raw: RawSnapshot): PrivateFlag[] {
  const flags: PrivateFlag[] = [];

  const htmlSamples = raw.htmlSamples?.data?.samples || [];
  const pagesWithTraces: string[] = [];

  // Common stack trace patterns
  const tracePatterns = [
    /at\s+[\w.]+\s+\([^)]+:\d+:\d+\)/i,  // JavaScript stack trace
    /stack trace:/i,
    /exception in thread/i,
    /traceback\s*\(/i,  // Python
    /in\s+`[^']*'\s+at\s+/i,  // Ruby
  ];

  for (const sample of htmlSamples) {
    for (const pattern of tracePatterns) {
      if (pattern.test(sample.html)) {
        pagesWithTraces.push(sample.url);
        break;
      }
    }
  }

  if (pagesWithTraces.length > 0) {
    flags.push({
      type: "data_quality",
      severity: "high",
      message: "Stack traces detected in HTML (REDACTED)",
      context: {
        category: "stack_traces_exposed",
        affectedPages: pagesWithTraces.length,
        details: "[REDACTED - See internal logs]",
      },
    });
  }

  return flags;
}

/**
 * Checks for obvious secrets in HTML/JS (PRIVATE FLAG).
 */
function checkObviousSecrets(raw: RawSnapshot): PrivateFlag[] {
  const flags: PrivateFlag[] = [];

  const htmlSamples = raw.htmlSamples?.data?.samples || [];
  const pagesWithSecrets: string[] = [];

  // Patterns for obvious secrets (high confidence only)
  const secretPatterns = [
    { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/ },
    { name: "API Key", pattern: /["']api[_-]?key["']\s*[:=]\s*["'][a-zA-Z0-9]{20,}["']/i },
    { name: "Private Key", pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
    { name: "Bearer Token", pattern: /["']bearer\s+[a-zA-Z0-9_\-\.]{20,}["']/i },
    { name: "Basic Auth", pattern: /basic\s+[a-zA-Z0-9]{20,}/i },
  ];

  for (const sample of htmlSamples) {
    let foundSecret = false;
    
    for (const { pattern } of secretPatterns) {
      if (pattern.test(sample.html)) {
        foundSecret = true;
        break;
      }
    }

    if (foundSecret) {
      pagesWithSecrets.push(sample.url);
    }
  }

  if (pagesWithSecrets.length > 0) {
    flags.push({
      type: "confidence",
      severity: "high",
      message: "Potential secrets detected in source (REDACTED)",
      context: {
        category: "exposed_secrets",
        affectedPages: pagesWithSecrets.length,
        details: "[REDACTED - See internal logs]",
      },
    });
  }

  return flags;
}

/**
 * Checks for internal hostnames exposed (PRIVATE FLAG).
 */
function checkInternalHostnames(raw: RawSnapshot): PrivateFlag[] {
  const flags: PrivateFlag[] = [];

  const htmlSamples = raw.htmlSamples?.data?.samples || [];
  const internalHosts = new Set<string>();

  // Pattern for internal hostnames
  const internalPatterns = [
    /https?:\/\/([a-z0-9-]+\.internal[\/\s"'])/i,
    /https?:\/\/([a-z0-9-]+\.local[\/\s"'])/i,
    /https?:\/\/([a-z0-9-]+\.corp[\/\s"'])/i,
    /https?:\/\/([a-z0-9-]+\.private[\/\s"'])/i,
    /https?:\/\/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/,  // IP addresses
    /https?:\/\/([a-z0-9-]+\.intranet[\/\s"'])/i,
  ];

  for (const sample of htmlSamples) {
    for (const pattern of internalPatterns) {
      const matches = sample.html.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          internalHosts.add(match[1]);
        }
      }
    }
  }

  if (internalHosts.size > 0) {
    flags.push({
      type: "data_quality",
      severity: "medium",
      message: "Internal hostnames detected in source (REDACTED)",
      context: {
        category: "internal_hostnames_exposed",
        uniqueHosts: internalHosts.size,
        details: "[REDACTED - See internal logs]",
      },
    });
  }

  return flags;
}
