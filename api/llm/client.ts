/**
 * LLM Client - Unified interface for Google Gemini and OpenAI GPT
 *
 * Supports:
 * - Google Gemini (primary for visual audits)
 * - OpenAI GPT (primary for synthesis)
 *
 * Features:
 * - API key from environment variables
 * - Timeout handling with configurable defaults
 * - Retry with exponential backoff
 * - Error handling that returns null on failure, never throws
 */

import { GoogleGenerativeAI, type GenerateContentResult } from "@google/generative-ai";
import OpenAI from "openai";
import {
  TIMEOUT_LLM_SYNTHESIS,
  MAX_RETRIES,
  RETRY_BASE_DELAY,
} from "../audit.config.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for LLM generation requests
 */
export interface LLMOptions {
  provider?: "gemini" | "openai";
  model?: string;
  timeout?: number;
  temperature?: number;
  systemInstruction?: string;
  maxTokens?: number;
}

/**
 * Token usage metadata from LLM response
 */
export interface LLMUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  systemTokens?: number;
  promptTokens?: number;
}

/**
 * Complete LLM response with metadata for tracing
 */
export interface LLMResponse {
  text: string;
  model: string;
  provider: "gemini" | "openai";
  durationMs: number;
  usageMetadata: LLMUsageMetadata;
  temperature?: number;
  maxTokens?: number;
}

/**
 * JSON Schema for structured output generation
 */
export interface JSONSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

/**
 * Main LLM Client interface
 */
export interface LLMClient {
  generateText(prompt: string, options?: LLMOptions): Promise<string | null>;
  generateWithVision(
    prompt: string,
    images: string[],
    options?: LLMOptions
  ): Promise<string | null>;
  generateStructured<T>(
    prompt: string,
    schema: JSONSchema,
    options?: LLMOptions
  ): Promise<T | null>;
  // New methods that return full response with metadata
  generateTextWithMetadata(prompt: string, options?: LLMOptions): Promise<LLMResponse | null>;
  generateWithVisionAndMetadata(
    prompt: string,
    images: string[],
    options?: LLMOptions
  ): Promise<LLMResponse | null>;
  generateStructuredWithMetadata<T>(
    prompt: string,
    schema: JSONSchema,
    options?: LLMOptions
  ): Promise<{ data: T; metadata: LLMResponse } | null>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GEMINI_MODEL_VISION = "gemini-2.5-flash";
const GEMINI_MODEL_TEXT = "gemini-2.5-flash";
const OPENAI_MODEL_SYNTHESIS = "gpt-4o";

const DEFAULT_TEMPERATURE = 0.7;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sleep utility for delay between retries
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * Returns null if all retries fail
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  baseDelay: number = RETRY_BASE_DELAY
): Promise<T | null> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on the last attempt
      if (attempt === maxRetries - 1) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  // All retries exhausted - log and return null
  console.error(`All ${maxRetries} retries failed:`, lastError?.message);
  return null;
}

/**
 * Create a timeout promise that rejects after specified milliseconds
 */
function createTimeout<T>(ms: number, operation: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Timeout: ${operation} exceeded ${ms}ms`));
    }, ms);
  });
}

/**
 * Race between a promise and a timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  operation: string
): Promise<T> {
  return Promise.race([promise, createTimeout<T>(ms, operation)]);
}

// ============================================================================
// GEMINI PROVIDER
// ============================================================================

class GeminiProvider {
  private client: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async generateText(
    prompt: string,
    model: string = GEMINI_MODEL_TEXT,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<string | null> {
    const result = await this.generateTextWithMetadata(prompt, model, temperature, timeoutMs);
    return result?.text ?? null;
  }

  async generateTextWithMetadata(
    prompt: string,
    model: string = GEMINI_MODEL_TEXT,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<LLMResponse | null> {
    if (!this.client) {
      console.error("Gemini client not initialized - missing GEMINI_API_KEY");
      return null;
    }

    const startTime = Date.now();

    return retryWithBackoff(async () => {
      const genModel = this.client!.getGenerativeModel({
        model,
        generationConfig: { temperature }
      });

      const response = await withTimeout<GenerateContentResult>(
        genModel.generateContent(prompt),
        timeoutMs,
        "Gemini text generation"
      );

      const text = response.response.text();
      if (!text) {
        throw new Error("Empty response from Gemini");
      }

      const usageMetadata = response.response.usageMetadata;

      return {
        text,
        model,
        provider: "gemini" as const,
        durationMs: Date.now() - startTime,
        usageMetadata: {
          promptTokenCount: usageMetadata?.promptTokenCount ?? 0,
          candidatesTokenCount: usageMetadata?.candidatesTokenCount ?? 0,
          totalTokenCount: usageMetadata?.totalTokenCount ?? 0,
        },
        temperature,
      };
    });
  }

  async generateWithVision(
    prompt: string,
    images: string[],
    model: string = GEMINI_MODEL_VISION,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<string | null> {
    const result = await this.generateWithVisionAndMetadata(prompt, images, model, temperature, timeoutMs);
    return result?.text ?? null;
  }

  async generateWithVisionAndMetadata(
    prompt: string,
    images: string[],
    model: string = GEMINI_MODEL_VISION,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<LLMResponse | null> {
    if (!this.client) {
      console.error("Gemini client not initialized - missing GEMINI_API_KEY");
      return null;
    }

    const startTime = Date.now();

    return retryWithBackoff(async () => {
      // Build content parts with images inline
      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
        { text: prompt },
      ];

      for (const base64Image of images) {
        // Detect mime type from base64 prefix or default to image/png
        let mimeType = "image/png";
        let data = base64Image;

        if (base64Image.startsWith("data:")) {
          const match = base64Image.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            data = match[2];
          }
        }

        parts.push({
          inlineData: {
            data,
            mimeType,
          },
        });
      }

      const genModel = this.client!.getGenerativeModel({
        model,
        generationConfig: { temperature }
      });

      const response = await withTimeout<GenerateContentResult>(
        genModel.generateContent(parts),
        timeoutMs,
        "Gemini vision generation"
      );

      const text = response.response.text();
      if (!text) {
        throw new Error("Empty response from Gemini vision");
      }

      const usageMetadata = response.response.usageMetadata;

      return {
        text,
        model,
        provider: "gemini" as const,
        durationMs: Date.now() - startTime,
        usageMetadata: {
          promptTokenCount: usageMetadata?.promptTokenCount ?? 0,
          candidatesTokenCount: usageMetadata?.candidatesTokenCount ?? 0,
          totalTokenCount: usageMetadata?.totalTokenCount ?? 0,
        },
        temperature,
      };
    });
  }

  async generateStructured<T>(
    prompt: string,
    schema: JSONSchema,
    model: string = GEMINI_MODEL_TEXT,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<T | null> {
    const result = await this.generateStructuredWithMetadata<T>(prompt, schema, model, temperature, timeoutMs);
    return result?.data ?? null;
  }

  async generateStructuredWithMetadata<T>(
    prompt: string,
    _schema: JSONSchema,
    model: string = GEMINI_MODEL_TEXT,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<{ data: T; metadata: LLMResponse } | null> {
    if (!this.client) {
      console.error("Gemini client not initialized - missing GEMINI_API_KEY");
      return null;
    }

    const startTime = Date.now();

    return retryWithBackoff(async () => {
      const genModel = this.client!.getGenerativeModel({
        model,
        generationConfig: {
          temperature,
          responseMimeType: "application/json",
        }
      });

      const response = await withTimeout<GenerateContentResult>(
        genModel.generateContent(prompt),
        timeoutMs,
        "Gemini structured generation"
      );

      const text = response.response.text();
      if (!text) {
        throw new Error("Empty response from Gemini structured");
      }

      const usageMetadata = response.response.usageMetadata;

      try {
        return {
          data: JSON.parse(text) as T,
          metadata: {
            text,
            model,
            provider: "gemini" as const,
            durationMs: Date.now() - startTime,
            usageMetadata: {
              promptTokenCount: usageMetadata?.promptTokenCount ?? 0,
              candidatesTokenCount: usageMetadata?.candidatesTokenCount ?? 0,
              totalTokenCount: usageMetadata?.totalTokenCount ?? 0,
            },
            temperature,
          },
        };
      } catch (parseError) {
        console.error("Failed to parse Gemini structured response:", parseError);
        throw new Error("Invalid JSON response from Gemini");
      }
    });
  }
}

// ============================================================================
// OPENAI PROVIDER
// ============================================================================

class OpenAIProvider {
  private client: OpenAI | null = null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async generateText(
    prompt: string,
    model: string = OPENAI_MODEL_SYNTHESIS,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<string | null> {
    const result = await this.generateTextWithMetadata(prompt, model, temperature, timeoutMs);
    return result?.text ?? null;
  }

  async generateTextWithMetadata(
    prompt: string,
    model: string = OPENAI_MODEL_SYNTHESIS,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<LLMResponse | null> {
    if (!this.client) {
      console.error("OpenAI client not initialized - missing OPENAI_API_KEY");
      return null;
    }

    const startTime = Date.now();

    return retryWithBackoff(async () => {
      const response = await withTimeout(
        this.client!.chat.completions.create({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature,
        }),
        timeoutMs,
        "OpenAI text generation"
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from OpenAI");
      }

      return {
        text: content,
        model,
        provider: "openai" as const,
        durationMs: Date.now() - startTime,
        usageMetadata: {
          promptTokenCount: response.usage?.prompt_tokens ?? 0,
          candidatesTokenCount: response.usage?.completion_tokens ?? 0,
          totalTokenCount: response.usage?.total_tokens ?? 0,
        },
        temperature,
      };
    });
  }

  async generateWithVision(
    prompt: string,
    images: string[],
    model: string = OPENAI_MODEL_SYNTHESIS,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<string | null> {
    const result = await this.generateWithVisionAndMetadata(prompt, images, model, temperature, timeoutMs);
    return result?.text ?? null;
  }

  async generateWithVisionAndMetadata(
    prompt: string,
    images: string[],
    model: string = OPENAI_MODEL_SYNTHESIS,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<LLMResponse | null> {
    if (!this.client) {
      console.error("OpenAI client not initialized - missing OPENAI_API_KEY");
      return null;
    }

    const startTime = Date.now();

    return retryWithBackoff(async () => {
      // Build content with images for GPT-4 Vision
      const content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      > = [{ type: "text", text: prompt }];

      for (const base64Image of images) {
        // Ensure proper data URL format
        const imageUrl = base64Image.startsWith("data:")
          ? base64Image
          : `data:image/png;base64,${base64Image}`;

        content.push({
          type: "image_url",
          image_url: { url: imageUrl },
        });
      }

      const response = await withTimeout(
        this.client!.chat.completions.create({
          model,
          messages: [{ role: "user", content }],
          temperature,
        }),
        timeoutMs,
        "OpenAI vision generation"
      );

      const result = response.choices[0]?.message?.content;
      if (!result) {
        throw new Error("Empty response from OpenAI vision");
      }

      return {
        text: result,
        model,
        provider: "openai" as const,
        durationMs: Date.now() - startTime,
        usageMetadata: {
          promptTokenCount: response.usage?.prompt_tokens ?? 0,
          candidatesTokenCount: response.usage?.completion_tokens ?? 0,
          totalTokenCount: response.usage?.total_tokens ?? 0,
        },
        temperature,
      };
    });
  }

  async generateStructured<T>(
    prompt: string,
    schema: JSONSchema,
    model: string = OPENAI_MODEL_SYNTHESIS,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<T | null> {
    const result = await this.generateStructuredWithMetadata<T>(prompt, schema, model, temperature, timeoutMs);
    return result?.data ?? null;
  }

  async generateStructuredWithMetadata<T>(
    prompt: string,
    _schema: JSONSchema,
    model: string = OPENAI_MODEL_SYNTHESIS,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<{ data: T; metadata: LLMResponse } | null> {
    if (!this.client) {
      console.error("OpenAI client not initialized - missing OPENAI_API_KEY");
      return null;
    }

    const startTime = Date.now();

    return retryWithBackoff(async () => {
      const response = await withTimeout(
        this.client!.chat.completions.create({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature,
          response_format: { type: "json_object" },
        }),
        timeoutMs,
        "OpenAI structured generation"
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from OpenAI structured");
      }

      try {
        return {
          data: JSON.parse(content) as T,
          metadata: {
            text: content,
            model,
            provider: "openai" as const,
            durationMs: Date.now() - startTime,
            usageMetadata: {
              promptTokenCount: response.usage?.prompt_tokens ?? 0,
              candidatesTokenCount: response.usage?.completion_tokens ?? 0,
              totalTokenCount: response.usage?.total_tokens ?? 0,
            },
            temperature,
          },
        };
      } catch (parseError) {
        console.error("Failed to parse OpenAI structured response:", parseError);
        throw new Error("Invalid JSON response from OpenAI");
      }
    });
  }
}

// ============================================================================
// UNIFIED LLM CLIENT
// ============================================================================

class UnifiedLLMClient implements LLMClient {
  private gemini: GeminiProvider;
  private openai: OpenAIProvider;

  constructor() {
    this.gemini = new GeminiProvider();
    this.openai = new OpenAIProvider();
  }

  /**
   * Generate text - OpenAI is primary for synthesis
   */
  async generateText(
    prompt: string,
    options: LLMOptions = {}
  ): Promise<string | null> {
    const result = await this.generateTextWithMetadata(prompt, options);
    return result?.text ?? null;
  }

  /**
   * Generate text with full metadata for tracing
   */
  async generateTextWithMetadata(
    prompt: string,
    options: LLMOptions = {}
  ): Promise<LLMResponse | null> {
    const {
      provider,
      model,
      timeout = TIMEOUT_LLM_SYNTHESIS,
      temperature = DEFAULT_TEMPERATURE,
    } = options;

    try {
      // Use specified provider or default to OpenAI for synthesis
      if (provider === "gemini") {
        return await this.gemini.generateTextWithMetadata(
          prompt,
          model || GEMINI_MODEL_TEXT,
          temperature,
          timeout
        );
      }

      // Default: OpenAI for synthesis
      if (this.openai.isAvailable()) {
        const result = await this.openai.generateTextWithMetadata(
          prompt,
          model || OPENAI_MODEL_SYNTHESIS,
          temperature,
          timeout
        );
        if (result !== null) return result;
      }

      // Fallback to Gemini if OpenAI fails or unavailable
      if (this.gemini.isAvailable()) {
        return await this.gemini.generateTextWithMetadata(
          prompt,
          model || GEMINI_MODEL_TEXT,
          temperature,
          timeout
        );
      }

      console.error("No LLM provider available");
      return null;
    } catch (error) {
      console.error("generateTextWithMetadata failed:", error);
      return null;
    }
  }

  /**
   * Generate with vision - Gemini is primary for visual audits
   */
  async generateWithVision(
    prompt: string,
    images: string[],
    options: LLMOptions = {}
  ): Promise<string | null> {
    const result = await this.generateWithVisionAndMetadata(prompt, images, options);
    return result?.text ?? null;
  }

  /**
   * Generate with vision with full metadata for tracing
   */
  async generateWithVisionAndMetadata(
    prompt: string,
    images: string[],
    options: LLMOptions = {}
  ): Promise<LLMResponse | null> {
    const {
      provider,
      model,
      timeout = TIMEOUT_LLM_SYNTHESIS,
      temperature = DEFAULT_TEMPERATURE,
    } = options;

    try {
      // Use specified provider or default to Gemini for vision
      if (provider === "openai") {
        return await this.openai.generateWithVisionAndMetadata(
          prompt,
          images,
          model || OPENAI_MODEL_SYNTHESIS,
          temperature,
          timeout
        );
      }

      // Default: Gemini for vision
      if (this.gemini.isAvailable()) {
        const result = await this.gemini.generateWithVisionAndMetadata(
          prompt,
          images,
          model || GEMINI_MODEL_VISION,
          temperature,
          timeout
        );
        if (result !== null) return result;
      }

      // Fallback to OpenAI if Gemini fails or unavailable
      if (this.openai.isAvailable()) {
        return await this.openai.generateWithVisionAndMetadata(
          prompt,
          images,
          model || OPENAI_MODEL_SYNTHESIS,
          temperature,
          timeout
        );
      }

      console.error("No LLM provider available for vision");
      return null;
    } catch (error) {
      console.error("generateWithVisionAndMetadata failed:", error);
      return null;
    }
  }

  /**
   * Generate structured output
   */
  async generateStructured<T>(
    prompt: string,
    schema: JSONSchema,
    options: LLMOptions = {}
  ): Promise<T | null> {
    const result = await this.generateStructuredWithMetadata<T>(prompt, schema, options);
    return result?.data ?? null;
  }

  /**
   * Generate structured output with full metadata for tracing
   */
  async generateStructuredWithMetadata<T>(
    prompt: string,
    schema: JSONSchema,
    options: LLMOptions = {}
  ): Promise<{ data: T; metadata: LLMResponse } | null> {
    const {
      provider,
      model,
      timeout = TIMEOUT_LLM_SYNTHESIS,
      temperature = DEFAULT_TEMPERATURE,
    } = options;

    try {
      // Use specified provider or default to OpenAI for structured output
      if (provider === "gemini") {
        return await this.gemini.generateStructuredWithMetadata<T>(
          prompt,
          schema,
          model || GEMINI_MODEL_TEXT,
          temperature,
          timeout
        );
      }

      // Default: OpenAI for structured output
      if (this.openai.isAvailable()) {
        const result = await this.openai.generateStructuredWithMetadata<T>(
          prompt,
          schema,
          model || OPENAI_MODEL_SYNTHESIS,
          temperature,
          timeout
        );
        if (result !== null) return result;
      }

      // Fallback to Gemini if OpenAI fails or unavailable
      if (this.gemini.isAvailable()) {
        return await this.gemini.generateStructuredWithMetadata<T>(
          prompt,
          schema,
          model || GEMINI_MODEL_TEXT,
          temperature,
          timeout
        );
      }

      console.error("No LLM provider available for structured output");
      return null;
    } catch (error) {
      console.error("generateStructuredWithMetadata failed:", error);
      return null;
    }
  }
}

// ============================================================================
// EXPORT
// ============================================================================

const llmClient: LLMClient = new UnifiedLLMClient();
export default llmClient;
