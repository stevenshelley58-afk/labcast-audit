/**
 * OpenAI Provider
 *
 * Wrapper for OpenAI API with semaphore-based rate limiting.
 * Supports GPT-4o vision and structured outputs.
 */

import type {
  Provider,
  OpenAIConfig,
  GenerateRequest,
  GenerateResult,
  UsageMetadata,
} from './types.js';
import { calculateCost, Semaphore } from './types.js';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Omit<OpenAIConfig, 'apiKey'> = {
  maxConcurrent: 2,
  defaultModel: 'gpt-4o',
  timeout: 60000,
};

// ============================================================================
// OpenAI Types (minimal, to avoid full SDK import)
// ============================================================================

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAIContentPart[];
}

interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

interface OpenAIResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

// ============================================================================
// OpenAI Provider Implementation
// ============================================================================

export class OpenAIProvider implements Provider {
  readonly name = 'openai' as const;
  private apiKey: string;
  private config: OpenAIConfig;
  private semaphore: InstanceType<typeof Semaphore>;
  private maxConcurrent: number;

  constructor(config: Partial<OpenAIConfig> & { apiKey?: string } = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      apiKey: this.apiKey,
    };

    this.maxConcurrent = this.config.maxConcurrent;
    this.semaphore = new Semaphore(this.config.maxConcurrent);
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  getConcurrencyUsage(): { active: number; max: number } {
    return {
      active: this.semaphore.getActive(),
      max: this.maxConcurrent,
    };
  }

  async generateContent(request: GenerateRequest): Promise<GenerateResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI provider not initialized (missing API key)');
    }

    const startTime = Date.now();
    const model = request.options?.model || this.config.defaultModel;

    // Acquire semaphore permit
    await this.semaphore.acquire();

    try {
      // Build messages
      const messages: OpenAIMessage[] = [];

      // Add system message if provided
      if (request.options?.systemInstruction) {
        messages.push({
          role: 'system',
          content: request.options.systemInstruction,
        });
      }

      // Build user message content
      if (request.image) {
        // Vision request with image
        const content: OpenAIContentPart[] = [
          { type: 'text', text: request.prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${request.imageMimeType || 'image/jpeg'};base64,${request.image}`,
              detail: 'high',
            },
          },
        ];
        messages.push({ role: 'user', content });
      } else {
        // Text-only request
        messages.push({ role: 'user', content: request.prompt });
      }

      // Build request body
      const body: Record<string, unknown> = {
        model,
        messages,
      };

      if (request.options?.temperature !== undefined) {
        body.temperature = request.options.temperature;
      }

      if (request.options?.maxTokens !== undefined) {
        body.max_tokens = request.options.maxTokens;
      }

      if (request.options?.responseFormat === 'json') {
        body.response_format = { type: 'json_object' };
      }

      // Make the API call
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...(this.config.organization && {
            'OpenAI-Organization': this.config.organization,
          }),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`
        );
      }

      const data: OpenAIResponse = await response.json();
      const durationMs = Date.now() - startTime;

      const text = data.choices[0]?.message?.content || '';

      // Extract usage metadata
      const usage: UsageMetadata = {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      };

      const cost = calculateCost(model, usage.promptTokens, usage.completionTokens);

      return {
        text,
        usage,
        model: data.model,
        durationMs,
        cost,
        provider: 'openai',
      };
    } finally {
      this.semaphore.release();
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let defaultProvider: OpenAIProvider | null = null;

export function getOpenAIProvider(config?: Partial<OpenAIConfig>): OpenAIProvider {
  if (!config && defaultProvider) {
    return defaultProvider;
  }

  const provider = new OpenAIProvider(config);

  if (!config) {
    defaultProvider = provider;
  }

  return provider;
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function generateWithOpenAI(request: GenerateRequest): Promise<GenerateResult> {
  const provider = getOpenAIProvider();
  return provider.generateContent(request);
}

/**
 * Generate content from image using GPT-4o Vision
 */
export async function generateFromImageOpenAI(
  prompt: string,
  imageBase64: string,
  options?: GenerateRequest['options']
): Promise<GenerateResult> {
  const provider = getOpenAIProvider();
  return provider.generateContent({
    prompt,
    image: imageBase64,
    imageMimeType: 'image/jpeg',
    options: {
      ...options,
      model: options?.model || 'gpt-4o',
    },
  });
}

/**
 * Generate structured JSON output
 */
export async function generateJsonWithOpenAI(
  prompt: string,
  systemInstruction?: string,
  options?: Omit<GenerateRequest['options'], 'responseFormat'>
): Promise<GenerateResult> {
  const provider = getOpenAIProvider();
  return provider.generateContent({
    prompt,
    options: {
      ...options,
      systemInstruction,
      responseFormat: 'json',
    },
  });
}
