/**
 * HTML Signals Extractor
 * 
 * Extracts per-page HTML signals from HTML samples.
 * No network calls, no LLM calls, never throws.
 * Returns TriState values for safe access patterns.
 */

import type { HtmlSample, PageSignals } from "../audit.types.ts";
import { normalizeUrl } from "../audit.util.ts";

/**
 * Extracts page signals from HTML samples.
 * 
 * @param samples - HTML samples from crawled pages
 * @returns Array of PageSignals, one per page
 */
export function extractHtmlSignals(samples: HtmlSample[]): PageSignals[] {
  if (!samples || samples.length === 0) {
    return [];
  }

  return samples.map((sample) => extractPageSignals(sample));
}

/**
 * Extracts signals from a single HTML sample.
 * Never throws - returns safe defaults on error.
 * 
 * @param sample - Single HTML sample
 * @returns PageSignals extracted from the sample
 */
function extractPageSignals(sample: HtmlSample): PageSignals {
  const url = sample.url || "";
  const html = sample.html || "";
  const headers = sample.headers || {};

  try {
    // Extract title
    const title = extractTitle(html);
    
    // Extract meta description
    const metaDescription = extractMetaDescription(html);
    
    // Extract canonical
    const canonical = extractCanonical(html);
    const canonicalSelf = isCanonicalSelf(url, canonical);
    
    // Extract H1s
    const h1s = extractH1s(html);
    const h1 = h1s.length > 0 ? h1s[0] : null;
    const h1Count = h1s.length;
    
    // Extract all headings
    const headings = extractHeadings(html);
    
    // Extract schema
    const schema = extractSchema(html);
    
    // Extract images
    const images = extractImages(html);
    
    // Extract links
    const links = extractLinks(html, url);
    
    // Check mixed content
    const mixedContent = detectMixedContent(url, html);
    
    // Check viewport
    const hasViewport = hasViewportMeta(html);
    
    // Check lang attribute
    const hasLang = hasLangAttribute(html);
    
    // Check charset
    const hasCharset = hasCharsetMeta(html);
    
    // Word count (approximate from text content)
    const wordCount = estimateWordCount(html);

    return {
      url,
      title,
      titleLength: title ? title.length : 0,
      metaDescription,
      metaDescriptionLength: metaDescription ? metaDescription.length : 0,
      canonical,
      canonicalSelf,
      h1,
      h1Count,
      headings,
      schema,
      images,
      links,
      mixedContent,
      hasViewport,
      hasLang,
      hasCharset,
      wordCount,
    };
  } catch {
    // Return minimal valid PageSignals on error
    return {
      url,
      title: null,
      titleLength: 0,
      metaDescription: null,
      metaDescriptionLength: 0,
      canonical: null,
      canonicalSelf: false,
      h1: null,
      h1Count: 0,
      headings: { h2: [], h3: [], h4: [], h5: [], h6: [] },
      schema: [],
      images: [],
      links: { internal: [], external: [], broken: [] },
      mixedContent: false,
      hasViewport: false,
      hasLang: false,
      hasCharset: false,
      wordCount: 0,
    };
  }
}

/**
 * Extracts the page title from HTML.
 */
function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = match ? match[1].trim() : null;
  return title && title.length > 0 ? title : null;
}

/**
 * Extracts meta description from HTML.
 */
function extractMetaDescription(html: string): string | null {
  const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
                 html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  const description = match ? match[1].trim() : null;
  return description && description.length > 0 ? description : null;
}

/**
 * Extracts meta robots from HTML.
 */
function extractMetaRobots(html: string): string | null {
  const match = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
                 html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']robots["'][^>]*>/i);
  const robots = match ? match[1].trim() : null;
  return robots && robots.length > 0 ? robots : null;
}

/**
 * Extracts canonical URL from HTML.
 */
function extractCanonical(html: string): string | null {
  const match = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/i) ||
                 html.match(/<link[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["'][^>]*>/i);
  const canonical = match ? match[1].trim() : null;
  return canonical && canonical.length > 0 ? canonical : null;
}

/**
 * Checks if canonical is self-referencing.
 */
function isCanonicalSelf(url: string, canonical: string | null): boolean {
  if (!canonical) return false;
  try {
    return normalizeUrl(url) === normalizeUrl(canonical);
  } catch {
    return false;
  }
}

/**
 * Extracts all H1 text content.
 */
function extractH1s(html: string): string[] {
  const h1s: string[] = [];
  const regex = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = stripHtml(match[1]).trim();
    if (text.length > 0) {
      h1s.push(text);
    }
  }
  return h1s;
}

/**
 * Extracts all headings (h2-h6).
 */
function extractHeadings(html: string): PageSignals["headings"] {
  const headings: PageSignals["headings"] = {
    h2: [],
    h3: [],
    h4: [],
    h5: [],
    h6: [],
  };

  for (let level = 2; level <= 6; level++) {
    const regex = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, "gi");
    let match;
    while ((match = regex.exec(html)) !== null) {
      const text = stripHtml(match[1]).trim();
      if (text.length > 0) {
        headings[`h${level}` as keyof typeof headings].push(text);
      }
    }
  }

  return headings;
}

/**
 * Extracts JSON-LD schema from HTML.
 */
function extractSchema(html: string): PageSignals["schema"] {
  const schemas: PageSignals["schema"] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    const jsonContent = match[1].trim();
    if (!jsonContent) continue;
    
    try {
      const parsed = JSON.parse(jsonContent);
      const types = extractSchemaTypes(parsed);
      
      for (const type of types) {
        schemas.push({
          type,
          jsonLd: parsed,
          valid: true,
        });
      }
    } catch {
      // Invalid JSON-LD
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
 * Recursively extracts @type values from schema.
 */
function extractSchemaTypes(node: unknown): string[] {
  const types: string[] = [];
  
  if (typeof node !== "object" || node === null) {
    return types;
  }
  
  if (Array.isArray(node)) {
    for (const item of node) {
      types.push(...extractSchemaTypes(item));
    }
  } else {
    const obj = node as Record<string, unknown>;
    if (typeof obj["@type"] === "string") {
      types.push(obj["@type"]);
    } else if (Array.isArray(obj["@type"])) {
      for (const t of obj["@type"]) {
        if (typeof t === "string") {
          types.push(t);
        }
      }
    }
    
    // Check nested properties
    for (const key of Object.keys(obj)) {
      if (key !== "@type") {
        types.push(...extractSchemaTypes(obj[key]));
      }
    }
  }
  
  return types;
}

/**
 * Extracts image data from HTML.
 */
function extractImages(html: string): PageSignals["images"] {
  const images: PageSignals["images"] = [];
  const regex = /<img[^>]*>/gi;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    const imgTag = match[0];
    const src = extractAttribute(imgTag, "src");
    const alt = extractAttribute(imgTag, "alt");
    const width = parseInt(extractAttribute(imgTag, "width") || "", 10) || null;
    const height = parseInt(extractAttribute(imgTag, "height") || "", 10) || null;
    
    if (src) {
      images.push({
        src,
        alt: alt || null,
        width,
        height,
        size: null, // Would require network request to determine
      });
    }
  }
  
  return images;
}

/**
 * Extracts links from HTML.
 */
function extractLinks(html: string, baseUrl: string): PageSignals["links"] {
  const links: PageSignals["links"] = {
    internal: [],
    external: [],
    broken: [],
  };
  
  const seenUrls = new Set<string>();
  const regex = /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  
  try {
    const baseDomain = new URL(baseUrl).hostname;
    
    while ((match = regex.exec(html)) !== null) {
      const href = match[1].trim();
      const text = stripHtml(match[2]).trim();
      const anchorTag = match[0];
      
      // Skip anchors, javascript:, mailto:, tel:, etc.
      if (!href || href.startsWith("#") || href.startsWith("javascript:") || 
          href.startsWith("mailto:") || href.startsWith("tel:")) {
        continue;
      }
      
      // Resolve relative URLs
      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(href, baseUrl).toString();
      } catch {
        continue;
      }
      
      // Skip duplicates
      if (seenUrls.has(absoluteUrl)) {
        continue;
      }
      seenUrls.add(absoluteUrl);
      
      const linkDomain = new URL(absoluteUrl).hostname;
      const isInternal = linkDomain === baseDomain;
      const nofollow = anchorTag.toLowerCase().includes('rel=') && 
                       anchorTag.toLowerCase().includes('nofollow');
      
      const linkData = {
        url: absoluteUrl,
        text: text.length > 100 ? text.slice(0, 100) + "..." : text,
        nofollow,
      };
      
      if (isInternal) {
        links.internal.push(linkData);
      } else {
        links.external.push(linkData);
      }
    }
  } catch {
    // Return empty links on error
  }
  
  return links;
}

/**
 * Detects mixed content (HTTP resources on HTTPS pages).
 */
function detectMixedContent(pageUrl: string, html: string): boolean {
  if (!pageUrl.startsWith("https://")) {
    return false;
  }
  
  // Check for http:// in src, href, url() attributes
  const httpPattern = /(src|href|url\(\s*["']?)http:\/\//i;
  return httpPattern.test(html);
}

/**
 * Checks for viewport meta tag.
 */
function hasViewportMeta(html: string): boolean {
  return /<meta[^>]*name=["']viewport["'][^>]*>/i.test(html);
}

/**
 * Checks for lang attribute on html element.
 */
function hasLangAttribute(html: string): boolean {
  return /<html[^>]*lang=["'][^"']+["'][^>]*>/i.test(html);
}

/**
 * Checks for charset meta tag.
 */
function hasCharsetMeta(html: string): boolean {
  return /<meta[^>]*charset=/i.test(html);
}

/**
 * Estimates word count from HTML content.
 */
function estimateWordCount(html: string): number {
  const text = stripHtml(html);
  // Split by whitespace and filter empty strings
  const words = text.split(/\s+/).filter(word => word.length > 0);
  return words.length;
}

/**
 * Strips HTML tags from content.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts an attribute value from an HTML tag.
 */
function extractAttribute(tag: string, attrName: string): string | null {
  const regex = new RegExp(`${attrName}=["']([^"']*)["']`, "i");
  const match = tag.match(regex);
  return match ? match[1] : null;
}

/**
 * Exports for use by other extractors
 */
export { extractSchemaTypes, extractMetaRobots, extractCanonical };
