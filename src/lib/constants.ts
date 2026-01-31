export const MODELS = {
  DEFAULT: 'gemini-2.5-flash',
  VISION: 'gemini-2.5-flash',
  PRO: 'gemini-2.5-pro',
} as const;

export const API_ENDPOINTS = {
  AUDIT: '/api/audit',
  SCREENSHOT: '/api/screenshot',
} as const;

export const FETCH_TIMEOUT_MS = 5000;
export const SCREENSHOT_TIMEOUT_MS = 10000;
export const MAX_CONTENT_LENGTH = 5000;
