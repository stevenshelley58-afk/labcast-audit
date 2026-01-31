/**
 * Schema.org Structured Data Extractor
 * 
 * Parses JSON-LD scripts from HTML to extract schema types,
 * detect parse errors, and identify page types.
 * No network calls, no LLM calls, never throws.
 */

import type { HtmlSample, PageSignals } from "../audit.types.js";

/**
 * Schema extraction result for a page
 */
export interface SchemaPageResult {
  url: string;
  types: string[];
  parseErrors: string[];
  isProductPage: boolean;
  isArticlePage: boolean;
  hasOrganization: boolean;
  schemas: PageSignals["schema"];
}

/**
 * Site-wide schema summary
 */
export interface SchemaSummary {
  pages: SchemaPageResult[];
  allTypes: string[];
  productPages: string[];
  articlePages: string[];
  organizationPages: string[];
  totalParseErrors: number;
}

/**
 * Extracts schema data from HTML samples.
 * 
 * @param samples - HTML samples from crawled pages
 * @returns SchemaSummary with page-level and site-wide data
 */
export function extractSchema(samples: HtmlSample[]): SchemaSummary {
  if (!samples || samples.length === 0) {
    return {
      pages: [],
      allTypes: [],
      productPages: [],
      articlePages: [],
      organizationPages: [],
      totalParseErrors: 0,
    };
  }

  const pages: SchemaPageResult[] = [];
  const allTypesSet = new Set<string>();
  const productPages: string[] = [];
  const articlePages: string[] = [];
  const organizationPages: string[] = [];
  let totalParseErrors = 0;

  for (const sample of samples) {
    const result = extractPageSchema(sample);
    pages.push(result);

    // Aggregate types
    for (const type of result.types) {
      allTypesSet.add(type);
    }

    // Track page types
    if (result.isProductPage) {
      productPages.push(sample.url);
    }
    if (result.isArticlePage) {
      articlePages.push(sample.url);
    }
    if (result.hasOrganization) {
      organizationPages.push(sample.url);
    }

    totalParseErrors += result.parseErrors.length;
  }

  return {
    pages,
    allTypes: Array.from(allTypesSet).sort(),
    productPages,
    articlePages,
    organizationPages,
    totalParseErrors,
  };
}

/**
 * Extracts schema from a single HTML sample.
 * 
 * @param sample - HTML sample
 * @returns SchemaPageResult
 */
function extractPageSchema(sample: HtmlSample): SchemaPageResult {
  const url = sample.url || "";
  const html = sample.html || "";

  try {
    const schemas = parseJsonLdSchemas(html);
    const types: string[] = [];
    const parseErrors: string[] = [];

    for (const schema of schemas) {
      if (schema.valid) {
        types.push(schema.type);
      } else {
        parseErrors.push(...(schema.errors || ["Unknown parse error"]));
      }
    }

    // Check for specific schema types
    const isProductPage = types.some(t => 
      t.toLowerCase() === "product" || 
      t === "https://schema.org/Product" ||
      t === "http://schema.org/Product"
    );

    const isArticlePage = types.some(t => 
      t.toLowerCase() === "article" || 
      t === "https://schema.org/Article" ||
      t === "http://schema.org/Article" ||
      t.toLowerCase() === "newsarticle" ||
      t.toLowerCase() === "blogposting"
    );

    const hasOrganization = types.some(t => 
      t.toLowerCase() === "organization" || 
      t === "https://schema.org/Organization" ||
      t === "http://schema.org/Organization" ||
      t.toLowerCase() === "localbusiness" ||
      t.toLowerCase() === "corporation"
    );

    return {
      url,
      types: [...new Set(types)], // Deduplicate
      parseErrors,
      isProductPage,
      isArticlePage,
      hasOrganization,
      schemas,
    };
  } catch {
    // Return empty result on error
    return {
      url,
      types: [],
      parseErrors: ["Failed to parse schema"],
      isProductPage: false,
      isArticlePage: false,
      hasOrganization: false,
      schemas: [],
    };
  }
}

/**
 * Parses JSON-LD script tags from HTML.
 * 
 * @param html - HTML content
 * @returns Array of schema objects
 */
function parseJsonLdSchemas(html: string): PageSignals["schema"] {
  const schemas: PageSignals["schema"] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    const jsonContent = match[1].trim();
    if (!jsonContent) continue;
    
    try {
      const parsed = JSON.parse(jsonContent);
      
      // Handle @graph array
      if (parsed["@graph"] && Array.isArray(parsed["@graph"])) {
        for (const item of parsed["@graph"]) {
          const types = extractTypesFromNode(item);
          for (const type of types) {
            schemas.push({
              type,
              jsonLd: item,
              valid: true,
            });
          }
        }
      } else {
        // Single object
        const types = extractTypesFromNode(parsed);
        for (const type of types) {
          schemas.push({
            type,
            jsonLd: parsed,
            valid: true,
          });
        }
      }
    } catch {
      schemas.push({
        type: "ParseError",
        jsonLd: {},
        valid: false,
        errors: ["Invalid JSON-LD syntax"],
      });
    }
  }
  
  return schemas;
}

/**
 * Extracts @type values from a schema node.
 * 
 * @param node - Schema node object
 * @returns Array of type strings
 */
function extractTypesFromNode(node: Record<string, unknown>): string[] {
  const types: string[] = [];
  
  if (typeof node["@type"] === "string") {
    types.push(node["@type"]);
  } else if (Array.isArray(node["@type"])) {
    for (const t of node["@type"]) {
      if (typeof t === "string") {
        types.push(t);
      }
    }
  }
  
  return types;
}

/**
 * Type guards for schema detection
 */
export function isProductSchema(schema: PageSignals["schema"][number]): boolean {
  const type = schema.type.toLowerCase();
  return type === "product" || 
         type === "https://schema.org/product" ||
         type === "http://schema.org/product";
}

export function isArticleSchema(schema: PageSignals["schema"][number]): boolean {
  const type = schema.type.toLowerCase();
  return type === "article" || 
         type === "https://schema.org/article" ||
         type === "http://schema.org/article" ||
         type === "newsarticle" ||
         type === "blogposting";
}

export function isOrganizationSchema(schema: PageSignals["schema"][number]): boolean {
  const type = schema.type.toLowerCase();
  return type === "organization" || 
         type === "https://schema.org/organization" ||
         type === "http://schema.org/organization" ||
         type === "localbusiness" ||
         type === "corporation";
}
