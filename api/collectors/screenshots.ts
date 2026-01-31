/**
 * Screenshots Collector
 * 
 * Captures desktop and mobile screenshots using Playwright.
 * - Desktop: 1920x1080
 * - Mobile: 390x844 (iPhone 12 Pro)
 * - Captures final URL after navigation
 * - Captures console error count and top 10 messages
 */

import type { CollectorOutput, ScreenshotsData } from "../audit.types.js";
import { TIMEOUT_SCREENSHOT } from "../audit.config.js";

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
 * Captures desktop and mobile screenshots of a URL using Playwright.
 * 
 * @param url - The URL to screenshot
 * @returns CollectorOutput with desktop/mobile screenshots, final URL, and console errors
 */
export async function collectScreenshots(
  url: string
): Promise<CollectorOutput<ScreenshotsData>> {
  let playwright;
  
  try {
    // Dynamically import playwright to avoid dependency issues if not installed
    playwright = await import("playwright");
  } catch {
    return {
      data: null,
      error: "Playwright not installed. Run: npm install playwright",
    };
  }

  const browser = await playwright.chromium.launch({
    headless: true,
  });

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
