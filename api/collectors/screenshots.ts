/**
 * Screenshots Collector
 *
 * Captures desktop and mobile screenshots using ScreenshotOne API (for serverless)
 * or Playwright (for local development).
 *
 * - Desktop: 1920x1080
 * - Mobile: 390x844 (iPhone 12 Pro)
 *
 * Environment variables:
 * - SCREENSHOTONE_API_KEY: API key for ScreenshotOne service
 */

import type { CollectorOutput, ScreenshotsData } from "../audit.types.js";
import { TIMEOUT_SCREENSHOT } from "../audit.config.js";

/**
 * Captures a screenshot using ScreenshotOne API
 * @param url - URL to screenshot
 * @param viewport - Viewport dimensions
 * @param mobile - Whether to use mobile user agent
 * @returns Base64 encoded image or null
 */
async function captureWithScreenshotOne(
  url: string,
  viewport: { width: number; height: number },
  mobile: boolean = false
): Promise<string | null> {
  const apiKey = process.env.SCREENSHOTONE_API_KEY;
  if (!apiKey) {
    return null;
  }

  const params = new URLSearchParams({
    access_key: apiKey,
    url: url,
    viewport_width: viewport.width.toString(),
    viewport_height: viewport.height.toString(),
    device_scale_factor: mobile ? "3" : "1",
    format: "png",
    block_ads: "true",
    block_cookie_banners: "true",
    block_trackers: "true",
    delay: "2", // Wait 2 seconds for page to render
    timeout: "30",
  });

  if (mobile) {
    params.set("user_agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15");
  }

  try {
    const response = await fetch(
      `https://api.screenshotone.com/take?${params.toString()}`,
      { signal: AbortSignal.timeout(30000) }
    );

    if (!response.ok) {
      console.error(`ScreenshotOne API error: ${response.status}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  } catch (error) {
    console.error("ScreenshotOne capture failed:", error);
    return null;
  }
}

/**
 * Sanitizes console messages to remove sensitive data.
 * Truncates long messages and limits array length.
 */
function sanitizeConsoleMessage(msg: string): string {
  // Truncate very long messages
  const truncated = msg.length > 500 ? msg.slice(0, 500) + "..." : msg;

  // Remove potential sensitive data patterns (emails, tokens, etc.)
  return truncated
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/[a-f0-9]{32,}/gi, "[HASH]")
    .replace(/token[=:][^&\s]+/gi, "token=[REDACTED]")
    .replace(/key[=:][^&\s]+/gi, "key=[REDACTED]");
}

/**
 * Captures desktop and mobile screenshots of a URL.
 * Uses ScreenshotOne API in serverless, Playwright locally.
 *
 * @param url - The URL to screenshot
 * @returns CollectorOutput with desktop/mobile screenshots, final URL, and console errors
 */
export async function collectScreenshots(
  url: string
): Promise<CollectorOutput<ScreenshotsData>> {
  // In serverless environment, use ScreenshotOne API
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // Check if API key is configured
    if (!process.env.SCREENSHOTONE_API_KEY) {
      return {
        data: null,
        error: "Screenshots skipped: SCREENSHOTONE_API_KEY not configured",
      };
    }

    console.log("[Screenshots] Using ScreenshotOne API for serverless environment");

    try {
      // Capture desktop and mobile in parallel
      const [desktop, mobile] = await Promise.all([
        captureWithScreenshotOne(url, { width: 1920, height: 1080 }, false),
        captureWithScreenshotOne(url, { width: 390, height: 844 }, true),
      ]);

      if (!desktop && !mobile) {
        return {
          data: null,
          error: "ScreenshotOne API failed to capture any screenshots",
        };
      }

      return {
        data: {
          desktop,
          mobile,
          finalUrl: url,
          consoleErrors: [], // API doesn't capture console errors
        },
        error: null,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        data: null,
        error: `Screenshot API failed: ${errorMessage}`,
      };
    }
  }

  // Local environment: use Playwright
  let playwright;

  try {
    // Dynamically import playwright-core to avoid dependency issues if not installed
    playwright = await import("playwright-core");
  } catch {
    return {
      data: null,
      error: "Playwright not installed. Run: npm install playwright",
    };
  }

  let browser;
  try {
    browser = await playwright.chromium.launch({
      headless: true,
    });
  } catch (launchError) {
    const msg = launchError instanceof Error ? launchError.message : String(launchError);
    return {
      data: null,
      error: `Browser launch failed: ${msg.includes("Executable") ? "Browser not installed" : msg}`,
    };
  }

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 LabcastAudit/2.0",
    });

    const page = await context.newPage();

    // Collect console messages
    const consoleMessages: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleMessages.push(msg.text());
      }
    });

    // Navigate to URL with timeout
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: TIMEOUT_SCREENSHOT,
    });

    if (!response) {
      return {
        data: null,
        error: "Failed to navigate to URL - no response",
      };
    }

    const finalUrl = page.url();

    // Capture desktop screenshot
    const desktopBuffer = await page.screenshot({
      fullPage: false,
      type: "png",
    });
    const desktop = desktopBuffer.toString("base64");

    // Close desktop context
    await context.close();

    // Create mobile context (iPhone 12 Pro)
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1 LabcastAudit/2.0",
    });

    const mobilePage = await mobileContext.newPage();

    // Navigate to final URL on mobile
    await mobilePage.goto(finalUrl, {
      waitUntil: "networkidle",
      timeout: TIMEOUT_SCREENSHOT,
    });

    // Capture mobile screenshot
    const mobileBuffer = await mobilePage.screenshot({
      fullPage: false,
      type: "png",
    });
    const mobile = mobileBuffer.toString("base64");

    await mobileContext.close();

    // Sanitize and limit console errors
    const consoleErrors = consoleMessages
      .map(sanitizeConsoleMessage)
      .slice(0, 10);

    return {
      data: {
        desktop,
        mobile,
        finalUrl,
        consoleErrors,
      },
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      data: null,
      error: `Screenshot capture failed: ${errorMessage}`,
    };
  } finally {
    await browser.close();
  }
}
