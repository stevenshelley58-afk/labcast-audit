/**
 * SEO Audit System - API Endpoint
 *
 * Vercel serverless function that exposes the audit pipeline as an HTTP API.
 *
 * Endpoint: POST /api/audit
 * Body: { url: string }
 *
 * Response:
 * - 200: Audit completed successfully
 * - 400: Invalid request (missing URL)
 * - 405: Method not allowed (only POST)
 * - 500: Audit failed (with error details)
 *
 * Critical Requirements:
 * - Any URL returns a report, even if blocked
 * - No unhandled exceptions
 * - Public report never contains exploit-enabling details
 * - privateFlags never appear in public response
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runAuditPipeline } from "./audit.runner.js";

/**
 * Vercel serverless function handler for the audit API.
 *
 * @param req - Vercel request object
 * @param res - Vercel response object
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Set CORS headers for browser access
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    res.status(405).json({
      error: "Method not allowed",
      message: "Only POST requests are accepted. Use POST /api/audit with JSON body.",
    });
    return;
  }

  // Extract URL from request body
  const { url } = req.body;

  // Validate URL presence
  if (!url || typeof url !== "string") {
    res.status(400).json({
      error: "URL required",
      message: "Please provide a URL in the request body: { \"url\": \"https://example.com\" }",
    });
    return;
  }

  // Validate URL format (basic check)
  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    res.status(400).json({
      error: "URL required",
      message: "URL cannot be empty.",
    });
    return;
  }

  // Optional: Validate URL looks like a valid URL
  // Allow URLs with or without protocol
  const urlPattern = /^(https?:\/\/)?([\w.-]+)(:\d+)?(\/[^\s]*)?$/i;
  if (!urlPattern.test(trimmedUrl)) {
    res.status(400).json({
      error: "Invalid URL",
      message: "The provided URL does not appear to be valid.",
    });
    return;
  }

  try {
    // Run the audit pipeline
    // The pipeline handles all errors internally and never throws
    console.log(`[API] Starting audit for: ${trimmedUrl}`);
    const result = await runAuditPipeline({ url: trimmedUrl });

    console.log(`[API] Audit complete for: ${result.identity.normalizedUrl}`);

    // Transform publicReport to frontend-expected format
    const publicReport = result.publicReport;

    // Convert priorities and category findings to frontend AuditFinding format
    const findings = [
      ...publicReport.priorities.map((p, idx) => ({
        id: `priority-${idx}`,
        category: 'seo' as const,
        title: p.title,
        description: p.description,
        impact: p.impact === 'high' ? 'High' : p.impact === 'medium' ? 'Medium' : 'Low',
        priority: p.rank as 1 | 2 | 3 | 4 | 5,
        fix: p.description,
      })),
      ...Object.values(publicReport.categories).flatMap((cat, catIdx) =>
        cat.findings.map((f, idx) => ({
          id: `${cat.name}-${idx}`,
          category: (cat.name === 'security' ? 'technical' : cat.name === 'crawl' ? 'seo' : cat.name) as 'seo' | 'technical' | 'design' | 'conversion' | 'content',
          title: f.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          description: f.message,
          impact: f.severity === 'critical' ? 'High' : f.severity === 'warning' ? 'Medium' : 'Low',
          priority: (catIdx + 1) as 1 | 2 | 3 | 4 | 5,
          fix: f.message,
        }))
      ),
    ];

    // Return in frontend-expected format
    res.status(200).json({
      report: {
        overallScore: publicReport.summary.score,
        url: result.identity.normalizedUrl,
        summary: publicReport.summary.overview,
        designAnalysis: {
          aestheticScore: publicReport.categories.visual?.score ?? 80,
          pricePointMatch: 'N/A',
          critique: publicReport.categories.visual?.summary ?? 'Visual analysis not available',
        },
        findings,
        generatedAt: publicReport.generatedAt,
      },
      traces: [],
      metadata: {
        totalCost: 0,
        totalDurationMs: result.timings.completedAt
          ? new Date(result.timings.completedAt).getTime() - new Date(result.timings.startedAt).getTime()
          : 0,
        screenshotCaptured: result.coverage.screenshotsCaptured,
        pdpAnalyzed: false,
      },
    });
    return;
  } catch (error) {
    // This catch block should rarely be triggered since runAuditPipeline
    // handles errors internally, but we include it for safety
    console.error("[API] Unexpected error during audit:", error);

    res.status(500).json({
      error: "Audit failed",
      message: error instanceof Error ? error.message : "Unknown error occurred",
      // Include a minimal valid response so clients can still display something
      fallback: {
        url: trimmedUrl,
        score: 0,
        grade: "F",
        status: "failed",
      },
    });
    return;
  }
}
