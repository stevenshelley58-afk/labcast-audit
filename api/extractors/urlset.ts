/**
 * URL Template Detection Extractor
 * 
 * Detects URL patterns and templates from sampled URLs.
 * Identifies Shopify, WordPress, and other platform hints.
 * No network calls, no LLM calls, never throws.
 */

import type { HtmlSample, SitemapsData } from "../audit.types.js";

/**
 * Detected URL template
 */
export interface UrlTemplate {
  pattern: string;
  templateType: string;
  sampleUrls: string[];
  count: number;
  platformHint?: "shopify" | "wordpress" | "generic";
}

/**
 * URL set analysis result
 */
export interface UrlsetResult {
  templates: UrlTemplate[];
  allUrls: string[];
  platformHints: string[];
  detectedPlatform: "shopify" | "wordpress" | "woocommerce" | "magento" | "generic" | null;
  hasProductPages: boolean;
  hasBlogPages: boolean;
  hasCollectionPages: boolean;
  hasCategoryPages: boolean;
}

/**
 * Detects URL templates from HTML samples and sitemap data.
 * 
 * @param samples - HTML samples from crawled pages
 * @param sitemaps - Sitemap data (optional)
 * @returns UrlsetResult with detected templates
 */
export function extractUrlset(
  samples: HtmlSample[],
  sitemaps?: SitemapsData | null
): UrlsetResult {
  const urls = collectUrls(samples, sitemaps);
  
  if (urls.length === 0) {
    return {
      templates: [],
      allUrls: [],
      platformHints: [],
      detectedPlatform: null,
      hasProductPages: false,
      hasBlogPages: false,
      hasCollectionPages: false,
      hasCategoryPages: false,
    };
  }

  // Detect templates from URLs
  const templates = detectTemplates(urls);
  
  // Detect platform hints from URLs and HTML
  const platformHints = detectPlatformHints(samples, urls);
  
  // Determine primary platform
  const detectedPlatform = determinePlatform(platformHints, urls, samples);
  
  // Check for specific page types
  const hasProductPages = templates.some(t => 
    t.templateType === "product" || t.templateType === "pdp"
  );
  const hasBlogPages = templates.some(t => 
    t.templateType === "blog" || t.templateType === "article"
  );
  const hasCollectionPages = templates.some(t => 
    t.templateType === "collection" || t.templateType === "category"
  );
  const hasCategoryPages = templates.some(t => 
    t.templateType === "category"
  );

  return {
    templates,
    allUrls: urls,
    platformHints,
    detectedPlatform,
    hasProductPages,
    hasBlogPages,
    hasCollectionPages,
    hasCategoryPages,
  };
}

/**
 * Collects all URLs from samples and sitemaps.
 */
function collectUrls(samples: HtmlSample[], sitemaps?: SitemapsData | null): string[] {
  const urlSet = new Set<string>();
  
  // Add sample URLs
  for (const sample of samples || []) {
    if (sample.url) {
      urlSet.add(sample.url);
    }
  }
  
  // Add sitemap URLs
  if (sitemaps?.extractedUrls) {
    for (const url of sitemaps.extractedUrls) {
      urlSet.add(url);
    }
  }
  
  return Array.from(urlSet);
}

/**
 * Detects URL templates from URL patterns.
 */
function detectTemplates(urls: string[]): UrlTemplate[] {
  const templates: UrlTemplate[] = [];
  const patterns = new Map<string, string[]>();
  
  // Define pattern matchers
  const patternMatchers: Array<{ regex: RegExp; type: string; pattern: string }> = [
    // Shopify patterns
    { regex: /\/products\/[^\/]+$/i, type: "product", pattern: "/products/{slug}" },
    { regex: /\/collections\/[^\/]+$/i, type: "collection", pattern: "/collections/{slug}" },
    { regex: /\/pages\/[^\/]+$/i, type: "page", pattern: "/pages/{slug}" },
    { regex: /\/blogs\/[^\/]+\/[^\/]+$/i, type: "blog-post", pattern: "/blogs/{blog}/{post}" },
    
    // WordPress patterns
    { regex: /\/\d{4}\/\d{2}\/[^\/]+$/i, type: "blog-post", pattern: "/{year}/{month}/{slug}" },
    { regex: /\/category\/[^\/]+$/i, type: "category", pattern: "/category/{slug}" },
    { regex: /\/tag\/[^\/]+$/i, type: "tag", pattern: "/tag/{slug}" },
    { regex: /\/author\/[^\/]+$/i, type: "author", pattern: "/author/{slug}" },
    
    // E-commerce patterns
    { regex: /\/product\/[^\/]+$/i, type: "product", pattern: "/product/{slug}" },
    { regex: /\/item\/[^\/]+$/i, type: "product", pattern: "/item/{slug}" },
    { regex: /\/shop\/[^\/]+$/i, type: "product", pattern: "/shop/{slug}" },
    { regex: /\/catalog\/[^\/]+$/i, type: "catalog", pattern: "/catalog/{slug}" },
    { regex: /\/p\/[^\/]+$/i, type: "product", pattern: "/p/{slug}" },
    
    // Blog patterns
    { regex: /\/blog\/[^\/]+$/i, type: "blog-post", pattern: "/blog/{slug}" },
    { regex: /\/post\/[^\/]+$/i, type: "blog-post", pattern: "/post/{slug}" },
    { regex: /\/article\/[^\/]+$/i, type: "article", pattern: "/article/{slug}" },
    { regex: /\/news\/[^\/]+$/i, type: "news", pattern: "/news/{slug}" },
    
    // Generic patterns
    { regex: /\/about[^\/]*$/i, type: "about", pattern: "/about" },
    { regex: /\/contact[^\/]*$/i, type: "contact", pattern: "/contact" },
    { regex: /\/faq[^\/]*$/i, type: "faq", pattern: "/faq" },
    { regex: /\/help[^\/]*$/i, type: "help", pattern: "/help" },
    { regex: /\/support[^\/]*$/i, type: "support", pattern: "/support" },
    { regex: /\/terms[^\/]*$/i, type: "terms", pattern: "/terms" },
    { regex: /\/privacy[^\/]*$/i, type: "privacy", pattern: "/privacy" },
  ];
  
  // Categorize URLs
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;
      
      for (const matcher of patternMatchers) {
        if (matcher.regex.test(pathname)) {
          const existing = patterns.get(matcher.pattern) || [];
          existing.push(url);
          patterns.set(matcher.pattern, existing);
          break; // Only match first pattern
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }
  
  // Create template objects
  for (const [pattern, matchedUrls] of patterns) {
    // Find the template type from pattern matchers
    const matcher = patternMatchers.find(m => m.pattern === pattern);
    if (matcher && matchedUrls.length > 0) {
      templates.push({
        pattern,
        templateType: matcher.type,
        sampleUrls: matchedUrls.slice(0, 5), // Max 5 samples
        count: matchedUrls.length,
      });
    }
  }
  
  // Sort by count descending
  return templates.sort((a, b) => b.count - a.count);
}

/**
 * Detects platform hints from HTML and URLs.
 */
function detectPlatformHints(samples: HtmlSample[], urls: string[]): string[] {
  const hints: string[] = [];
  
  // Check URLs for platform patterns
  const urlString = urls.join(" ");
  
  // Shopify hints
  if (/\/products\/|\/collections\//.test(urlString)) {
    hints.push("shopify:url-patterns");
  }
  
  // WordPress hints
  if (/\/wp-content\/|\/wp-json\/|\/category\/|\/tag\//.test(urlString)) {
    hints.push("wordpress:url-patterns");
  }
  
  // Check HTML for platform signatures
  for (const sample of samples || []) {
    const html = sample.html || "";
    
    // Shopify HTML hints
    if (html.includes("cdn.shopify.com") || 
        html.includes("Shopify.theme") ||
        html.includes("shopify-buy")) {
      hints.push("shopify:html-signature");
    }
    
    // WordPress HTML hints
    if (html.includes("/wp-content/") || 
        html.includes("/wp-includes/") ||
        html.includes("wp-json") ||
        html.includes("wordpress") ||
        html.includes("wp-embed")) {
      hints.push("wordpress:html-signature");
    }
    
    // WooCommerce hints
    if (html.includes("woocommerce") || html.includes("wc-")) {
      hints.push("woocommerce:html-signature");
    }
    
    // Magento hints
    if (html.includes("magento") || html.includes("Mage.")) {
      hints.push("magento:html-signature");
    }
    
    // Check for product schema (common in e-commerce)
    if (html.includes('"@type": "Product"') || html.includes("'@type': 'Product'")) {
      hints.push("ecommerce:product-schema");
    }
    
    // Check for article schema (common in blogs)
    if (html.includes('"@type": "Article"') || html.includes("'@type': 'Article'")) {
      hints.push("blog:article-schema");
    }
  }
  
  // Deduplicate hints
  return [...new Set(hints)];
}

/**
 * Determines the primary platform from hints.
 */
function determinePlatform(
  hints: string[],
  urls: string[],
  samples: HtmlSample[]
): "shopify" | "wordpress" | "woocommerce" | "magento" | "generic" | null {
  const hintString = hints.join(" ");
  
  // Check for Shopify
  if (hintString.includes("shopify")) {
    return "shopify";
  }
  
  // Check for WooCommerce (WordPress + e-commerce)
  if (hintString.includes("woocommerce") || 
      (hintString.includes("wordpress") && hintString.includes("ecommerce"))) {
    return "woocommerce";
  }
  
  // Check for WordPress
  if (hintString.includes("wordpress")) {
    return "wordpress";
  }
  
  // Check for Magento
  if (hintString.includes("magento")) {
    return "magento";
  }
  
  // Try to infer from URL patterns
  const urlString = urls.join(" ");
  if (/\/products\/[^\/]+/.test(urlString) && /\/collections\/[^\/]+/.test(urlString)) {
    return "shopify";
  }
  
  if (/\/wp-content\//.test(urlString)) {
    return "wordpress";
  }
  
  // Check for e-commerce patterns
  if (hintString.includes("ecommerce") || /\/product\/[^\/]+/.test(urlString)) {
    return "generic"; // Generic e-commerce
  }
  
  return null;
}

/**
 * Groups URLs by path segments for pattern analysis.
 */
export function groupUrlsByPattern(urls: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split("/").filter(Boolean);
      
      if (segments.length === 0) {
        // Root URL
        const existing = groups.get("/") || [];
        existing.push(url);
        groups.set("/", existing);
      } else {
        // Create pattern from first segment
        const pattern = "/" + segments[0] + "/";
        const existing = groups.get(pattern) || [];
        existing.push(url);
        groups.set(pattern, existing);
      }
    } catch {
      // Invalid URL, skip
    }
  }
  
  return groups;
}

/**
 * Checks if URL matches a template pattern.
 */
export function matchesTemplate(url: string, template: UrlTemplate): boolean {
  // Convert template pattern to regex
  const pattern = template.pattern
    .replace(/\{[^}]+\}/g, "[^/]+") // Replace {slug} with wildcard
    .replace(/\//g, "\\/"); // Escape slashes
  
  const regex = new RegExp(pattern + "$", "i");
  return regex.test(new URL(url).pathname);
}
