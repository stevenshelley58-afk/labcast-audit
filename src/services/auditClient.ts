import { AuditResult, AuditConfig } from '../../types';
import { AuditError, isAuditError } from '../lib/errors';
import { API_ENDPOINTS } from '../lib/constants';

export { DEFAULT_AUDIT_CONFIG } from './defaultConfig';

export interface AuditMetadata {
  totalCost: number;
  totalDurationMs: number;
  screenshotCaptured: boolean;
  pdpAnalyzed: boolean;
}

export interface AuditResponse extends AuditResult {
  metadata: AuditMetadata;
}

export interface AuditApiError {
  code: string;
  message: string;
  details?: string;
  retryable?: boolean;
}

interface ApiErrorResponse {
  error: AuditApiError;
  traces?: AuditResult['traces'];
}

function isApiErrorResponse(data: unknown): data is ApiErrorResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as ApiErrorResponse).error === 'object'
  );
}

export async function runAudit(
  url: string,
  pdpUrl?: string,
  config?: AuditConfig,
  onLog?: (message: string) => void
): Promise<AuditResponse> {
  // Client-side URL validation
  let normalizedUrl = url.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  try {
    new URL(normalizedUrl);
  } catch {
    throw AuditError.invalidUrl(url);
  }

  // Validate optional PDP URL
  let normalizedPdpUrl: string | undefined;
  if (pdpUrl) {
    normalizedPdpUrl = pdpUrl.trim();
    if (!/^https?:\/\//i.test(normalizedPdpUrl)) {
      normalizedPdpUrl = 'https://' + normalizedPdpUrl;
    }
    try {
      new URL(normalizedPdpUrl);
    } catch {
      throw AuditError.invalidUrl(pdpUrl);
    }
  }

  onLog?.('Sending request to audit API...');

  try {
    const response = await fetch(API_ENDPOINTS.AUDIT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: normalizedUrl,
        pdpUrl: normalizedPdpUrl,
        config,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (isApiErrorResponse(data)) {
        const { error } = data;
        throw new AuditError(
          error.code as AuditError['code'],
          error.message,
          error.details,
          error.retryable ?? false
        );
      }
      throw AuditError.apiError(`API returned ${response.status}`, JSON.stringify(data));
    }

    onLog?.('Audit complete!');
    return data as AuditResponse;
  } catch (error) {
    if (isAuditError(error)) {
      throw error;
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new AuditError('NETWORK_ERROR', 'Failed to connect to audit service', error.message, true);
    }

    throw AuditError.apiError('Unexpected error during audit', String(error));
  }
}

export async function captureScreenshot(url: string): Promise<string | null> {
  try {
    const response = await fetch(API_ENDPOINTS.SCREENSHOT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.image || null;
  } catch {
    return null;
  }
}

// Re-export for backward compatibility during migration
export const generateAuditReport = async (
  rawUrl: string,
  onLog?: (msg: string) => void,
  config?: AuditConfig
): Promise<AuditResult> => {
  const result = await runAudit(rawUrl, undefined, config, onLog);
  return {
    report: result.report,
    traces: result.traces,
  };
};


