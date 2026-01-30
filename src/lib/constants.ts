export const MODELS = {
  DEFAULT: 'gemini-2.0-flash',
  VISION: 'gemini-2.0-flash',
  PRO: 'gemini-2.0-pro-exp-02-05',
} as const;

export const API_ENDPOINTS = {
  AUDIT: '/api/audit',
  SCREENSHOT: '/api/screenshot',
} as const;

export const FETCH_TIMEOUT_MS = 5000;
export const SCREENSHOT_TIMEOUT_MS = 10000;
export const MAX_CONTENT_LENGTH = 5000;
