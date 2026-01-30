import type { VercelRequest, VercelResponse } from '@vercel/node';

const SCREENSHOT_TIMEOUT_MS = 15000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      error: {
        code: 'INVALID_URL',
        message: 'URL is required',
      },
    });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({
      error: {
        code: 'INVALID_URL',
        message: 'Invalid URL format',
      },
    });
  }

  try {
    const encodedUrl = encodeURIComponent(url);
    const screenshotUrl = `https://s0.wp.com/mshots/v1/${encodedUrl}?w=1280&h=960`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SCREENSHOT_TIMEOUT_MS);

    const response = await fetch(screenshotUrl, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return res.status(502).json({
        error: {
          code: 'SCREENSHOT_FAILED',
          message: `Screenshot service returned ${response.status}`,
          retryable: true,
        },
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({
      success: true,
      image: base64,
      mimeType: 'image/jpeg',
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return res.status(504).json({
        error: {
          code: 'TIMEOUT',
          message: 'Screenshot capture timed out',
          retryable: true,
        },
      });
    }

    console.error('Screenshot error:', error);
    return res.status(500).json({
      error: {
        code: 'SCREENSHOT_FAILED',
        message: 'Failed to capture screenshot',
        retryable: true,
      },
    });
  }
}
