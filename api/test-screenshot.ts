/**
 * Test endpoint to debug screenshot capture
 * GET /api/test-screenshot?url=https://example.com
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const testUrl = (req.query.url as string) || "https://example.com";

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    testUrl,
    environment: {
      isVercel: !!process.env.VERCEL,
      hasApiKey: !!process.env.SCREENSHOTONE_API_KEY,
      apiKeyLength: process.env.SCREENSHOTONE_API_KEY?.length || 0,
      apiKeyPreview: process.env.SCREENSHOTONE_API_KEY
        ? `${process.env.SCREENSHOTONE_API_KEY.substring(0, 4)}...${process.env.SCREENSHOTONE_API_KEY.substring(process.env.SCREENSHOTONE_API_KEY.length - 4)}`
        : "NOT SET",
    },
    screenshotTest: null as unknown,
  };

  // Test the ScreenshotOne API directly
  if (process.env.SCREENSHOTONE_API_KEY) {
    const params = new URLSearchParams({
      access_key: process.env.SCREENSHOTONE_API_KEY,
      url: testUrl,
      viewport_width: "1280",
      viewport_height: "720",
      format: "png",
      timeout: "30",
    });

    const apiUrl = `https://api.screenshotone.com/take?${params.toString()}`;

    try {
      const startTime = Date.now();
      const response = await fetch(apiUrl);
      const durationMs = Date.now() - startTime;

      const contentType = response.headers.get("content-type") || "";

      if (!response.ok) {
        let errorBody = "";
        try {
          errorBody = await response.text();
        } catch {}

        results.screenshotTest = {
          success: false,
          status: response.status,
          statusText: response.statusText,
          contentType,
          errorBody: errorBody.substring(0, 500),
          durationMs,
        };
      } else if (contentType.includes("image/")) {
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        results.screenshotTest = {
          success: true,
          status: response.status,
          contentType,
          imageSize: bytes.length,
          isPng: bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71,
          firstBytes: `${bytes[0]}, ${bytes[1]}, ${bytes[2]}, ${bytes[3]}`,
          durationMs,
        };
      } else {
        let body = "";
        try {
          body = await response.text();
        } catch {}

        results.screenshotTest = {
          success: false,
          status: response.status,
          contentType,
          unexpectedBody: body.substring(0, 500),
          durationMs,
        };
      }
    } catch (error) {
      results.screenshotTest = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } else {
    results.screenshotTest = {
      success: false,
      error: "SCREENSHOTONE_API_KEY not set",
    };
  }

  res.status(200).json(results);
}
