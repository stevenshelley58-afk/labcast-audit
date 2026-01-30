/**
 * Page Snapshot Extractor
 *
 * Pure HTML parser for extracting SEO-relevant signals.
 * Deterministic - no LLM calls.
 */

import type {
  PageSnapshot,
  HeadingInfo,
  AnchorInfo,
  SchemaInfo,
  OpenGraphData,
  TwitterCardData,
  ImageInfo,
  HreflangInfo,
  ExtractionResult,
} from './types.js';

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract a PageSnapshot from HTML content
 */
export function extractPageSnapshot(
  html: string,
  url: string
): ExtractionResult {
  const startTime = Date.now();
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    const baseHost = new URL(url).hostname.replace(/^www\./, '');

    // Extract all components
    const title = extractTitle(html);
    const metaDescription = extractMetaContent(html, 'description');
    const metaRobots = extractMetaContent(html, 'robots');
    const canonical = extractCanonical(html);
    const headings = extractHeadings(html);
    const { navAnchors, internalCount, externalCount } = extractAnchors(html, url, baseHost);
    const schemas = extractSchemas(html);
    const hasForms = /<form\b/i.test(html);
    const openGraph = extractOpenGraph(html);
    const twitterCard = extractTwitterCard(html);
    const images = extractImages(html);
    const lang = extractAttribute(html, 'html', 'lang');
    const viewport = extractMetaContent(html, 'viewport');
    const charset = extractCharset(html);
    const hreflang = extractHreflang(html);
    const { wordCount, isThinContent } = analyzeContent(html);

    // Generate warnings
    if (!title) warnings.push('Missing <title> tag');
    if (!metaDescription) warnings.push('Missing meta description');
    if (!headings.some((h) => h.level === 1)) warnings.push('Missing H1 heading');
    if (headings.filter((h) => h.level === 1).length > 1) {
      warnings.push('Multiple H1 headings found');
    }
    if (!canonical) warnings.push('Missing canonical tag');
    if (!viewport) warnings.push('Missing viewport meta tag');
    if (isThinContent) warnings.push('Content appears thin (< 300 words)');

    // Check heading hierarchy
    const headingLevels = headings.map((h) => h.level);
    for (let i = 1; i < headingLevels.length; i++) {
      if (headingLevels[i] > headingLevels[i - 1] + 1) {
        warnings.push(`Heading hierarchy skip: H${headingLevels[i - 1]} to H${headingLevels[i]}`);
        break;
      }
    }

    // Check images for missing alt
    const imagesWithMissingAlt = images.filter((img) => img.missingAlt);
    if (imagesWithMissingAlt.length > 0) {
      warnings.push(`${imagesWithMissingAlt.length} image(s) missing alt text`);
    }

    const snapshot: PageSnapshot = {
      url,
      title,
      metaDescription,
      metaRobots,
      canonical,
      headings,
      navAnchors,
      internalLinkCount: internalCount,
      externalLinkCount: externalCount,
      schemas,
      hasForms,
      openGraph,
      twitterCard,
      images,
      lang,
      viewport,
      charset,
      hreflang,
      wordCount,
      isThinContent,
    };

    return {
      snapshot,
      warnings,
      errors,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    errors.push(`Extraction failed: ${error}`);

    // Return empty snapshot on error
    return {
      snapshot: createEmptySnapshot(url),
      warnings,
      errors,
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Individual Extractors
// ============================================================================

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? decodeHtmlEntities(match[1].trim()) : null;
}

function extractMetaContent(html: string, name: string): string | null {
  // Try name attribute
  const nameRegex = new RegExp(
    `<meta\\s+[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`,
    'i'
  );
  let match = html.match(nameRegex);
  if (match) return decodeHtmlEntities(match[1]);

  // Try content before name
  const reverseRegex = new RegExp(
    `<meta\\s+[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["']`,
    'i'
  );
  match = html.match(reverseRegex);
  if (match) return decodeHtmlEntities(match[1]);

  return null;
}

function extractCanonical(html: string): string | null {
  const match = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  if (match) return match[1];

  // Try reverse order
  const reverseMatch = html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  return reverseMatch ? reverseMatch[1] : null;
}

function extractHeadings(html: string): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  const regex = /<h([1-6])[^>]*>([^<]*(?:<[^/h][^>]*>[^<]*)*)<\/h\1>/gi;
  let match;
  let position = 0;

  while ((match = regex.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    const text = stripTags(match[2]).trim();

    if (text) {
      headings.push({
        level,
        text: text.substring(0, 200), // Limit length
        position: position++,
      });
    }
  }

  return headings;
}

function extractAnchors(
  html: string,
  baseUrl: string,
  baseHost: string
): { navAnchors: AnchorInfo[]; internalCount: number; externalCount: number } {
  const navAnchors: AnchorInfo[] = [];
  let internalCount = 0;
  let externalCount = 0;

  // Extract nav section
  const navMatch = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i);
  const navSection = navMatch ? navMatch[1] : '';

  // Extract all anchors
  const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*(?:<[^/a][^>]*>[^<]*)*)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = match[1];
    const text = stripTags(match[2]).trim();

    // Skip non-http links
    if (
      href.startsWith('#') ||
      href.startsWith('javascript:') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:')
    ) {
      continue;
    }

    // Determine if internal
    let isInternal = false;
    try {
      const absoluteUrl = new URL(href, baseUrl).toString();
      const linkHost = new URL(absoluteUrl).hostname.replace(/^www\./, '');
      isInternal = linkHost === baseHost;
    } catch {
      // Relative URL, assume internal
      isInternal = true;
    }

    if (isInternal) {
      internalCount++;
    } else {
      externalCount++;
    }

    // Check if this anchor is in nav section
    if (navSection && navSection.includes(match[0])) {
      navAnchors.push({
        text: text.substring(0, 100),
        href,
        isInternal,
      });
    }
  }

  return { navAnchors, internalCount, externalCount };
}

function extractSchemas(html: string): SchemaInfo[] {
  const schemas: SchemaInfo[] = [];
  const scriptRegex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const jsonStr = match[1].trim();
      const data = JSON.parse(jsonStr);

      // Handle arrays of schemas
      const schemaArray = Array.isArray(data) ? data : [data];

      for (const schema of schemaArray) {
        const type = schema['@type'] || 'Unknown';
        const types = Array.isArray(type) ? type : [type];

        for (const t of types) {
          schemas.push({
            type: t,
            hasRequiredProps: checkRequiredProps(schema, t),
            raw: jsonStr.substring(0, 500),
          });
        }
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  }

  return schemas;
}

function checkRequiredProps(schema: Record<string, unknown>, type: string): boolean {
  // Basic checks for common schema types
  const requiredByType: Record<string, string[]> = {
    Product: ['name'],
    Article: ['headline', 'author'],
    Organization: ['name'],
    LocalBusiness: ['name', 'address'],
    BreadcrumbList: ['itemListElement'],
    FAQPage: ['mainEntity'],
    Review: ['itemReviewed', 'reviewRating'],
    AggregateRating: ['ratingValue', 'reviewCount'],
  };

  const required = requiredByType[type];
  if (!required) return true;

  return required.every((prop) => schema[prop] !== undefined);
}

function extractOpenGraph(html: string): OpenGraphData {
  return {
    title: extractMetaProperty(html, 'og:title'),
    description: extractMetaProperty(html, 'og:description'),
    type: extractMetaProperty(html, 'og:type'),
    image: extractMetaProperty(html, 'og:image'),
    url: extractMetaProperty(html, 'og:url'),
    siteName: extractMetaProperty(html, 'og:site_name'),
  };
}

function extractTwitterCard(html: string): TwitterCardData {
  return {
    card: extractMetaName(html, 'twitter:card'),
    title: extractMetaName(html, 'twitter:title'),
    description: extractMetaName(html, 'twitter:description'),
    image: extractMetaName(html, 'twitter:image'),
    site: extractMetaName(html, 'twitter:site'),
  };
}

function extractMetaProperty(html: string, property: string): string | null {
  const regex = new RegExp(
    `<meta\\s+[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`,
    'i'
  );
  let match = html.match(regex);
  if (match) return decodeHtmlEntities(match[1]);

  // Try reverse order
  const reverseRegex = new RegExp(
    `<meta\\s+[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`,
    'i'
  );
  match = html.match(reverseRegex);
  return match ? decodeHtmlEntities(match[1]) : null;
}

function extractMetaName(html: string, name: string): string | null {
  return extractMetaContent(html, name);
}

function extractImages(html: string): ImageInfo[] {
  const images: ImageInfo[] = [];
  const imgRegex = /<img\s+([^>]*)>/gi;
  let match;
  let position = 0;

  while ((match = imgRegex.exec(html)) !== null && images.length < 20) {
    const attrs = match[1];

    const src = extractAttr(attrs, 'src') || extractAttr(attrs, 'data-src');
    if (!src) continue;

    const alt = extractAttr(attrs, 'alt');

    images.push({
      src,
      alt,
      missingAlt: alt === null || alt === '',
      width: extractAttr(attrs, 'width'),
      height: extractAttr(attrs, 'height'),
      loading: extractAttr(attrs, 'loading'),
      likelyAboveFold: position < 3,
    });

    position++;
  }

  return images;
}

function extractAttr(attrs: string, name: string): string | null {
  const regex = new RegExp(`${name}=["']([^"']+)["']`, 'i');
  const match = attrs.match(regex);
  return match ? match[1] : null;
}

function extractAttribute(html: string, tag: string, attr: string): string | null {
  const regex = new RegExp(`<${tag}\\s+[^>]*${attr}=["']([^"']+)["']`, 'i');
  const match = html.match(regex);
  return match ? match[1] : null;
}

function extractCharset(html: string): string | null {
  // Try meta charset
  const charsetMatch = html.match(/<meta\s+[^>]*charset=["']([^"']+)["']/i);
  if (charsetMatch) return charsetMatch[1];

  // Try http-equiv
  const httpEquivMatch = html.match(
    /<meta\s+[^>]*http-equiv=["']Content-Type["'][^>]*content=["'][^"']*charset=([^"'\s;]+)/i
  );
  return httpEquivMatch ? httpEquivMatch[1] : null;
}

function extractHreflang(html: string): HreflangInfo[] {
  const hreflang: HreflangInfo[] = [];
  const regex = /<link\s+[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["']/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    hreflang.push({
      lang: match[1],
      href: match[2],
    });
  }

  // Also try reverse attribute order
  const reverseRegex = /<link\s+[^>]*href=["']([^"']+)["'][^>]*hreflang=["']([^"']+)["'][^>]*rel=["']alternate["']/gi;
  while ((match = reverseRegex.exec(html)) !== null) {
    hreflang.push({
      lang: match[2],
      href: match[1],
    });
  }

  return hreflang;
}

function analyzeContent(html: string): { wordCount: number; isThinContent: boolean } {
  // Strip scripts, styles, and tags
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Decode entities
  text = decodeHtmlEntities(text);

  // Count words (simple split)
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  return {
    wordCount,
    isThinContent: wordCount < 300,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function createEmptySnapshot(url: string): PageSnapshot {
  return {
    url,
    title: null,
    metaDescription: null,
    metaRobots: null,
    canonical: null,
    headings: [],
    navAnchors: [],
    internalLinkCount: 0,
    externalLinkCount: 0,
    schemas: [],
    hasForms: false,
    openGraph: {
      title: null,
      description: null,
      type: null,
      image: null,
      url: null,
      siteName: null,
    },
    twitterCard: {
      card: null,
      title: null,
      description: null,
      image: null,
      site: null,
    },
    images: [],
    lang: null,
    viewport: null,
    charset: null,
    hreflang: [],
    wordCount: 0,
    isThinContent: true,
  };
}
