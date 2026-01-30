/**
 * Gemini Provider
 *
 * Wrapper for Google's Gemini API with semaphore-based rate limiting.
 * Supports URL Context and Google Search tools.
 */

import { GoogleGenAI, Type } from '@google/genai';
import type {
  Provider,
  GeminiConfig,
  GenerateRequest,
  GenerateResult,
  UsageMetadata,
  UrlRetrievalMetadata,
} from './types.js';
import { calculateCost, Semaphore } from './types.js';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Omit<GeminiConfig, 'apiKey'> = {
  maxConcurrent: 3,
  defaultModel: 'gemini-2.0-flash',
  timeout: 30000,
  experimental: false,
};

// ============================================================================
// Gemini Provider Implementation
// ============================================================================

export class GeminiProvider implements Provider {
  readonly name = 'gemini' as const;
  private client: GoogleGenAI | null = null;
  private config: GeminiConfig;
  private semaphore: InstanceType<typeof Semaphore>;
  private maxConcurrent: number;

  constructor(config: Partial<GeminiConfig> & { apiKey?: string } = {}) {
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY || '';

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      apiKey,
    };

    this.maxConcurrent = this.config.maxConcurrent;
    this.semaphore = new Semaphore(this.config.maxConcurrent);

    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  getConcurrencyUsage(): { active: number; max: number } {
    return {
      active: this.semaphore.getActive(),
      max: this.maxConcurrent,
    };
  }

  async generateContent(request: GenerateRequest): Promise<GenerateResult> {
    if (!this.client) {
      throw new Error('Gemini provider not initialized (missing API key)');
    }

    const startTime = Date.now();
    const model = request.options?.model || this.config.defaultModel;

    // Acquire semaphore permit
    await this.semaphore.acquire();

    try {
      // Build content parts
      const parts: unknown[] = [{ text: request.prompt }];

      if (request.image) {
        parts.push({
          inlineData: {
            mimeType: request.imageMimeType || 'image/jpeg',
            data: request.image,
          },
        });
      }

      // Build tools array
      const tools: unknown[] = [];
      if (request.tools?.googleSearch) {
        tools.push({ googleSearch: {} });
      }
      if (request.tools?.urlContext) {
        tools.push({ urlContext: {} });
      }

      // Build generation config
      const generationConfig: Record<string, unknown> = {
        systemInstruction: request.options?.systemInstruction,
        tools: tools.length > 0 ? tools : undefined,
      };

      if (request.options?.temperature !== undefined) {
        generationConfig.temperature = request.options.temperature;
      }

      if (request.options?.maxTokens !== undefined) {
        generationConfig.maxOutputTokens = request.options.maxTokens;
      }

      if (request.options?.responseFormat === 'json') {
        generationConfig.responseMimeType = 'application/json';
        if (request.options.responseSchema) {
          generationConfig.responseSchema = request.options.responseSchema;
        }
      }

      // Make the API call
      const response = await this.client.models.generateContent({
        model,
        contents: { parts },
        config: generationConfig,
      });

      const text = response.text || '';
      const durationMs = Date.now() - startTime;

      // Extract usage metadata
      const usage: UsageMetadata = {
        promptTokens: response.usageMetadata?.promptTokenCount || 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata?.totalTokenCount || 0,
      };

      // Extract URL context metadata if available
      const urlContextMetadata: UrlRetrievalMetadata[] = [];
      const candidates = response.candidates;
      if (candidates && candidates[0]?.urlContextMetadata?.urlMetadata) {
        for (const meta of candidates[0].urlContextMetadata.urlMetadata) {
          urlContextMetadata.push({
            url: meta.retrievedUrl || 'unknown',
            status: meta.urlRetrievalStatus || 'unknown',
          });
        }
      }

      const cost = calculateCost(model, usage.promptTokens, usage.completionTokens);

      return {
        text,
        usage,
        urlContextMetadata: urlContextMetadata.length > 0 ? urlContextMetadata : undefined,
        model,
        durationMs,
        cost,
        provider: 'gemini',
      };
    } finally {
      this.semaphore.release();
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let defaultProvider: GeminiProvider | null = null;

export function getGeminiProvider(config?: Partial<GeminiConfig>): GeminiProvider {
  if (!config && defaultProvider) {
    return defaultProvider;
  }

  const provider = new GeminiProvider(config);

  if (!config) {
    defaultProvider = provider;
  }

  return provider;
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function generateWithGemini(request: GenerateRequest): Promise<GenerateResult> {
  const provider = getGeminiProvider();
  return provider.generateContent(request);
}

/**
 * Generate content with URL context (Gemini-specific feature)
 */
export async function generateWithUrlContext(
  prompt: string,
  options?: GenerateRequest['options']
): Promise<GenerateResult> {
  const provider = getGeminiProvider();
  return provider.generateContent({
    prompt,
    options,
    tools: { urlContext: true },
  });
}

/**
 * Generate content with Google Search (Gemini-specific feature)
 */
export async function generateWithGoogleSearch(
  prompt: string,
  options?: GenerateRequest['options']
): Promise<GenerateResult> {
  const provider = getGeminiProvider();
  return provider.generateContent({
    prompt,
    options,
    tools: { googleSearch: true },
  });
}

/**
 * Generate content from image (vision)
 */
export async function generateFromImage(
  prompt: string,
  imageBase64: string,
  options?: GenerateRequest['options']
): Promise<GenerateResult> {
  const provider = getGeminiProvider();
  return provider.generateContent({
    prompt,
    image: imageBase64,
    imageMimeType: 'image/jpeg',
    options,
  });
}
