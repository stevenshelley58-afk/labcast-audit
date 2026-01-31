/**
 * Squirrelscan Collector
 * 
 * Runs squirrel security audit CLI tool.
 * Command: squirrel audit <url> --format llm -C surface -m 100
 * Always optional - never fails the audit run.
 */

import type { CollectorOutput, SquirrelscanData } from "../audit.types.js";
import { exec } from "child_process";
import { promisify } from "util";
import { TIMEOUT_SQUIRRELSCAN } from "../audit.config.js";

const execAsync = promisify(exec);

/**
 * Checks if squirrel CLI is installed.
 */
async function isSquirrelInstalled(): Promise<boolean> {
  try {
    await execAsync("squirrel --version", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitizes squirrel output to remove sensitive data.
 */
function sanitizeOutput(output: string): Record<string, unknown> {
  // Truncate very long output
  const truncated = output.length > 50000 
    ? output.slice(0, 50000) + "\n... [truncated]"
    : output;

  // Remove potential sensitive patterns
  const sanitized = truncated
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/[a-f0-9]{64}/gi, "[HASH64]")
    .replace(/[a-f0-9]{40}/gi, "[HASH40]")
    .replace(/[a-f0-9]{32}/gi, "[HASH32]")
    .replace(/api[_-]?key[:=][^\s]+/gi, "api_key=[REDACTED]")
    .replace(/token[:=][^\s]+/gi, "token=[REDACTED]")
    .replace(/password[:=][^\s]+/gi, "password=[REDACTED]")
    .replace(/secret[:=][^\s]+/gi, "secret=[REDACTED]");

  // Try to parse as JSON if it looks like JSON
  try {
    if (sanitized.trim().startsWith("{")) {
      return JSON.parse(sanitized) as Record<string, unknown>;
    }
  } catch {
    // Not valid JSON, return as text
  }

  // Return as structured output
  const lines = sanitized.split("\n");
  
  return {
    raw: sanitized,
    summary: extractSummary(lines),
    findings: extractFindings(lines),
    lineCount: lines.length,
  };
}

/**
 * Extracts a summary from squirrel output.
 */
function extractSummary(lines: string[]): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  
  for (const line of lines.slice(0, 50)) {
    // Look for common security scan summary patterns
    const criticalMatch = line.match(/critical[:\s]+(\d+)/i);
    if (criticalMatch) summary.critical = parseInt(criticalMatch[1], 10);
    
    const highMatch = line.match(/high[:\s]+(\d+)/i);
    if (highMatch) summary.high = parseInt(highMatch[1], 10);
    
    const mediumMatch = line.match(/medium[:\s]+(\d+)/i);
    if (mediumMatch) summary.medium = parseInt(mediumMatch[1], 10);
    
    const lowMatch = line.match(/low[:\s]+(\d+)/i);
    if (lowMatch) summary.low = parseInt(lowMatch[1], 10);
    
    const infoMatch = line.match(/info(?:rmation)?[:\s]+(\d+)/i);
    if (infoMatch) summary.info = parseInt(infoMatch[1], 10);
    
    // Look for total issues
    const totalMatch = line.match(/total[:\s]+(\d+)|(\d+)\s+issues?/i);
    if (totalMatch) summary.total = parseInt(totalMatch[1] || totalMatch[2], 10);
  }
  
  return summary;
}

/**
 * Extracts individual findings from squirrel output.
 */
function extractFindings(lines: string[]): Array<Record<string, string>> {
  const findings: Array<Record<string, string>> = [];
  let currentFinding: Record<string, string> | null = null;
  
  for (const line of lines) {
    // Detect finding headers (various formats)
    const findingMatch = line.match(/^(?:\[|\()?(CRITICAL|HIGH|MEDIUM|LOW|INFO)(?:\]|\))?:?\s*(.+)/i);
    
    if (findingMatch) {
      if (currentFinding) {
        findings.push(currentFinding);
      }
      currentFinding = {
        severity: findingMatch[1].toUpperCase(),
        title: findingMatch[2].trim(),
        description: "",
      };
    } else if (currentFinding) {
      // Accumulate description lines
      currentFinding.description += line + "\n";
    }
  }
  
  // Don't forget the last finding
  if (currentFinding) {
    findings.push(currentFinding);
  }
  
  // Limit to reasonable number
  return findings.slice(0, 100);
}

/**
 * Runs squirrel security audit on a URL.
 * 
 * This collector is always optional and will never fail the audit run.
 * If squirrel is not installed or fails, it returns an error but doesn't throw.
 * 
 * @param url - The URL to audit
 * @returns CollectorOutput with squirrel scan results
 */
export async function collectSquirrelscan(
  url: string
): Promise<CollectorOutput<SquirrelscanData>> {
  // Check if squirrel is installed
  const installed = await isSquirrelInstalled();
  
  if (!installed) {
    return {
      data: null,
      error: "Squirrel CLI not installed. Install from https://github.com/squirrelscan/squirrel or ignore this optional collector.",
    };
  }

  try {
    // Run squirrel audit command
    const command = `squirrel audit "${url}" --format llm -C surface -m 100`;
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 120000, // 120 second timeout as specified
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    // Combine stdout and stderr (some tools output to stderr)
    const output = stdout || stderr;

    if (!output || output.trim().length === 0) {
      return {
        data: { output: { empty: true } },
        error: null,
      };
    }

    // Sanitize and structure the output
    const sanitizedOutput = sanitizeOutput(output);

    return {
      data: { output: sanitizedOutput },
      error: null,
    };
  } catch (error) {
    // Squirrelscan is optional - return error but don't throw
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check for timeout specifically
    if (errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT")) {
      return {
        data: null,
        error: "Squirrelscan timed out after 120 seconds",
      };
    }

    return {
      data: null,
      error: `Squirrelscan failed (optional): ${errorMessage}`,
    };
  }
}
