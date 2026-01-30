/**
 * Provider Types
 *
 * Shared interfaces for multi-provider LLM support (Gemini + OpenAI).
 */

// ============================================================================
// Core Provider Interfaces
// ============================================================================

export type ProviderName = 'gemini' | 'openai';

export interface ProviderConfig {
  /** API key for the provider */
  apiKey: string;
  /** Maximum concurrent calls (semaphore limit) */
  maxConcurrent: number;
  /** Default model to use */
  defaultModel: string;
  /** Request timeout in ms */
  timeout: number;
}

export interface GenerateOptions {
  /** Model to use (overrides default) */
  model?: string;
  /** System instruction/prompt */
  systemInstruction?: string;
  /** Temperature for generation */
  temperature?: number;
  /** Max output tokens */
  maxTokens?: number;
  /** Response format */
  responseFormat?: 'text' | 'json';
  /** JSON schema for structured output */
  responseSchema?: unknown;
}

export interface ToolConfig {
  /** Enable Google Search (Gemini only) */
  googleSearch?: boolean;
  /** Enable URL Context retrieval (Gemini only) */
  urlContext?: boolean;
}

export interface GenerateRequest {
  /** Text prompt */
  prompt: string;
  /** Optional image (base64) */
  image?: string;
  /** Image MIME type */
  imageMimeType?: string;
  /** Generation options */
  options?: GenerateOptions;
  /** Tool configuration */
  tools?: ToolConfig;
}

export interface UrlRetrievalMetadata {
  url: string;
  status: string;
}

export interface UsageMetadata {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GenerateResult {
  /** Generated text content */
  text: string;
  /** Usage/token metadata */
  usage?: UsageMetadata;
  /** URL context metadata (Gemini only) */
  urlContextMetadata?: UrlRetrievalMetadata[];
  /** Model used */
  model: string;
  /** Duration in ms */
  durationMs: number;
  /** Estimated cost */
  cost: number;
  /** Provider that handled the request */
  provider: ProviderName;
  /** Request details for debugging */
  requestDetails?: {
    prompt: string;
    systemInstruction?: string;
    model: string;
  };
}

export interface Provider {
  /** Provider name */
  name: ProviderName;

  /** Generate content from a prompt */
  generateContent(request: GenerateRequest): Promise<GenerateResult>;

  /** Check if provider is available (has API key) */
  isAvailable(): boolean;

  /** Get current concurrency usage */
  getConcurrencyUsage(): { active: number; max: number };
}

// ============================================================================
// Provider-Specific Types
// ============================================================================

export interface GeminiConfig extends ProviderConfig {
  /** Enable experimental features */
  experimental?: boolean;
}

export interface OpenAIConfig extends ProviderConfig {
  /** Organization ID */
  organization?: string;
}

// ============================================================================
// Pricing
// ============================================================================

export interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini models
  'gemini-2.0-flash': { inputPer1k: 0.0001, outputPer1k: 0.0004 },
  'gemini-2.0-flash-exp': { inputPer1k: 0.0001, outputPer1k: 0.0004 },
  'gemini-2.0-pro-exp-02-05': { inputPer1k: 0.00025, outputPer1k: 0.001 },
  'gemini-3-pro-preview': { inputPer1k: 0.00025, outputPer1k: 0.001 },

  // OpenAI models
  'gpt-4o': { inputPer1k: 0.0025, outputPer1k: 0.01 },
  'gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  'gpt-4-turbo': { inputPer1k: 0.01, outputPer1k: 0.03 },
  'gpt-3.5-turbo': { inputPer1k: 0.0005, outputPer1k: 0.0015 },
  'o1': { inputPer1k: 0.015, outputPer1k: 0.06 },
  'o1-mini': { inputPer1k: 0.003, outputPer1k: 0.012 },
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] || { inputPer1k: 0.001, outputPer1k: 0.002 };
  return (inputTokens / 1000) * pricing.inputPer1k + (outputTokens / 1000) * pricing.outputPer1k;
}

// ============================================================================
// Semaphore for Rate Limiting
// ============================================================================

export class Semaphore {
  private permits: number;
  private maxPermits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
    this.maxPermits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      next?.();
    } else {
      this.permits++;
    }
  }

  getActive(): number {
    return this.maxPermits - this.permits + this.waiting.length;
  }

  getMax(): number {
    return this.maxPermits;
  }
}
