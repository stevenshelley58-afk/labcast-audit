/**
 * TLS Facts Collector
 * 
 * Performs TLS handshake to origin and records:
 * - Negotiated protocol
 * - Certificate issuer
 * - Expiry date
 * - Subject Alternative Names (SANs)
 * 
 * No cipher scanning, no probing.
 */

import type { CollectorOutput, TlsFactsData } from "../audit.types.js";
import { TIMEOUT_TLS } from "../audit.config.js";

/**
 * Performs TLS connection and extracts certificate information.
 * 
 * @param hostname - The hostname to connect to
 * @param port - The port (default 443)
 * @returns TlsFactsData
 */
async function performTlsCheck(
  hostname: string,
  port = 443
): Promise<TlsFactsData> {
  const { connect } = await import("node:tls");
  
  return new Promise((resolve, reject) => {
    const socket = connect(port, hostname, {
      servername: hostname,
    });

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TLS handshake timeout after ${TIMEOUT_TLS}ms`));
    }, TIMEOUT_TLS);

    socket.on("secureConnect", () => {
      clearTimeout(timeout);

      try {
        const cipher = socket.getCipher();
        const certificate = socket.getPeerCertificate(true);

        socket.end();

        // Extract certificate info
        const protocol = cipher.version || "unknown";
        const certIssuer = certificate.issuer?.O || 
                          certificate.issuer?.CN || 
                          "unknown";
        
        // Parse expiry date
        const validTo = certificate.valid_to;
        const expiryDate = validTo ? new Date(validTo).toISOString() : "unknown";

        // Extract SANs
        const sans: string[] = [];
        if (certificate.subjectaltname) {
          // subjectaltname format: "DNS:example.com, DNS:www.example.com"
          const sanMatches = certificate.subjectaltname.matchAll(/DNS:([^,\s]+)/g);
          for (const match of sanMatches) {
            if (match[1]) {
              sans.push(match[1]);
            }
          }
        }
        
        // Also add CN if present and not already in SANs
        const cn = certificate.subject?.CN;
        if (cn && !sans.includes(cn)) {
          sans.unshift(cn);
        }

        const data: TlsFactsData = {
          protocol,
          certIssuer,
          expiryDate,
          sans,
          errors: [],
        };

        resolve(data);
      } catch (error) {
        socket.destroy();
        reject(error);
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    socket.on("timeout", () => {
      clearTimeout(timeout);
      socket.destroy();
      reject(new Error("TLS connection timeout"));
    });
  });
}

/**
 * Collects TLS/SSL certificate facts for the domain.
 * 
 * @param normalizedUrl - The normalized root URL
 * @returns CollectorOutput with TlsFactsData
 */
export async function collectTlsFacts(
  normalizedUrl: string
): Promise<CollectorOutput<TlsFactsData>> {
  try {
    const url = new URL(normalizedUrl);
    const hostname = url.hostname;

    // Skip TLS check for non-HTTPS URLs
    if (url.protocol !== "https:") {
      return {
        data: null,
        error: "TLS check only applicable to HTTPS URLs",
      };
    }

    const data = await performTlsCheck(hostname);
    return { data, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown TLS error";
    return {
      data: null,
      error: errorMessage,
    };
  }
}
