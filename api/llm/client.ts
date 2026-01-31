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

import { GoogleGenAI } from "@google/genai";
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
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GEMINI_MODEL_VISION = "gemini-2.0-flash-exp";
const GEMINI_MODEL_TEXT = "gemini-2.5-flash";
const OPENAI_MODEL_SYNTHESIS = "gpt-5.2";

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
  private client: GoogleGenAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
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
    if (!this.client) {
      console.error("Gemini client not initialized - missing GEMINI_API_KEY");
      return null;
    }

    return retryWithBackoff(async () => {
      const response = await withTimeout(
        this.client!.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature,
          },
        }),
        timeoutMs,
        "Gemini text generation"
      );

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini");
      }

      return text;
    });
  }

  async generateWithVision(
    prompt: string,
    images: string[],
    model: string = GEMINI_MODEL_VISION,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<string | null> {
    if (!this.client) {
      console.error("Gemini client not initialized - missing GEMINI_API_KEY");
      return null;
    }

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

      const response = await withTimeout(
        this.client!.models.generateContent({
          model,
          contents: parts,
          config: {
            temperature,
          },
        }),
        timeoutMs,
        "Gemini vision generation"
      );

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini vision");
      }

      return text;
    });
  }

  async generateStructured<T>(
    prompt: string,
    schema: JSONSchema,
    model: string = GEMINI_MODEL_TEXT,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<T | null> {
    if (!this.client) {
      console.error("Gemini client not initialized - missing GEMINI_API_KEY");
      return null;
    }

    return retryWithBackoff(async () => {
      const response = await withTimeout(
        this.client!.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature,
            responseMimeType: "application/json",
            responseSchema: schema as unknown as Record<string, unknown>,
          },
        }),
        timeoutMs,
        "Gemini structured generation"
      );

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini structured");
      }

      try {
        return JSON.parse(text) as T;
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
    if (!this.client) {
      console.error("OpenAI client not initialized - missing OPENAI_API_KEY");
      return null;
    }

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

      return content;
    });
  }

  async generateWithVision(
    prompt: string,
    images: string[],
    model: string = OPENAI_MODEL_SYNTHESIS,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<string | null> {
    if (!this.client) {
      console.error("OpenAI client not initialized - missing OPENAI_API_KEY");
      return null;
    }

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

      return result;
    });
  }

  async generateStructured<T>(
    prompt: string,
    _schema: JSONSchema,
    model: string = OPENAI_MODEL_SYNTHESIS,
    temperature: number = DEFAULT_TEMPERATURE,
    timeoutMs: number = TIMEOUT_LLM_SYNTHESIS
  ): Promise<T | null> {
    if (!this.client) {
      console.error("OpenAI client not initialized - missing OPENAI_API_KEY");
      return null;
    }

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
        return JSON.parse(content) as T;
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
    const {
      provider,
      model,
      timeout = TIMEOUT_LLM_SYNTHESIS,
      temperature = DEFAULT_TEMPERATURE,
    } = options;

    try {
      // Use specified provider or default to OpenAI for synthesis
      if (provider === "gemini") {
        return await this.gemini.generateText(
          prompt,
          model || GEMINI_MODEL_TEXT,
          temperature,
          timeout
        );
      }

      // Default: OpenAI for synthesis
      if (this.openai.isAvailable()) {
        const result = await this.openai.generateText(
          prompt,
          model || OPENAI_MODEL_SYNTHESIS,
          temperature,
          timeout
        );
        if (result !== null) return result;
      }

      // Fallback to Gemini if OpenAI fails or unavailable
      if (this.gemini.isAvailable()) {
        return await this.gemini.generateText(
          prompt,
          model || GEMINI_MODEL_TEXT,
          temperature,
          timeout
        );
      }

      console.error("No LLM provider available");
      return null;
    } catch (error) {
      console.error("generateText failed:", error);
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
    const {
      provider,
      model,
      timeout = TIMEOUT_LLM_SYNTHESIS,
      temperature = DEFAULT_TEMPERATURE,
    } = options;

    try {
      // Use specified provider or default to Gemini for vision
      if (provider === "openai") {
        return await this.openai.generateWithVision(
          prompt,
          images,
          model || OPENAI_MODEL_SYNTHESIS,
          temperature,
          timeout
        );
      }

      // Default: Gemini for vision
      if (this.gemini.isAvailable()) {
        const result = await this.gemini.generateWithVision(
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
        return await this.openai.generateWithVision(
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
      console.error("generateWithVision failed:", error);
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
    const {
      provider,
      model,
      timeout = TIMEOUT_LLM_SYNTHESIS,
      temperature = DEFAULT_TEMPERATURE,
    } = options;

    try {
      // Use specified provider or default to OpenAI for structured output
      if (provider === "gemini") {
        return await this.gemini.generateStructured<T>(
          prompt,
          schema,
          model || GEMINI_MODEL_TEXT,
          temperature,
          timeout
        );
      }

      // Default: OpenAI for structured output
      if (this.openai.isAvailable()) {
        const result = await this.openai.generateStructured<T>(
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
        return await this.gemini.generateStructured<T>(
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
      console.error("generateStructured failed:", error);
      return null;
    }
  }
}

// ============================================================================
// EXPORT
// ============================================================================

const llmClient: LLMClient = new UnifiedLLMClient();
export default llmClient;
