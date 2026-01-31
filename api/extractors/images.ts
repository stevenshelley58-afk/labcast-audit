/**
 * Image Extractor
 * 
 * Extracts and analyzes image tags from HTML samples.
 * Checks for alt text presence and guesses format from URL.
 * No network calls, no LLM calls, never throws.
 */

import type { HtmlSample } from "../audit.types.ts";

/**
 * Image data for extraction
 */
export interface ImageData {
  src: string;
  hasAlt: boolean;
  altText?: string;
  format: string | null;
  width?: number | null;
  height?: number | null;
  isLazy: boolean;
  isResponsive: boolean;
}

/**
 * Image analysis for a single page
 */
export interface PageImages {
  url: string;
  images: ImageData[];
  missingAltCount: number;
  totalImages: number;
  formats: string[];
}

/**
 * Site-wide image summary
 */
export interface ImagesSummary {
  pages: PageImages[];
  allImages: ImageData[];
  totalMissingAlt: number;
  formatDistribution: Record<string, number>;
  hasWebp: boolean;
  hasAvif: boolean;
  hasLazyLoading: boolean;
  hasResponsiveImages: boolean;
}

/**
 * Extracts and analyzes images from HTML samples.
 * 
 * @param samples - HTML samples from crawled pages
 * @returns ImagesSummary with page-level and site-wide data
 */
export function extractImages(samples: HtmlSample[]): ImagesSummary {
  if (!samples || samples.length === 0) {
    return {
      pages: [],
      allImages: [],
      totalMissingAlt: 0,
      formatDistribution: {},
      hasWebp: false,
      hasAvif: false,
      hasLazyLoading: false,
      hasResponsiveImages: false,
    };
  }

  const pages: PageImages[] = [];
  const allImages: ImageData[] = [];
  let totalMissingAlt = 0;
  const formatCounts: Record<string, number> = {};
  let hasWebp = false;
  let hasAvif = false;
  let hasLazyLoading = false;
  let hasResponsiveImages = false;

  for (const sample of samples) {
    const pageImages = extractPageImages(sample);
    pages.push(pageImages);

    for (const img of pageImages.images) {
      allImages.push(img);

      if (!img.hasAlt) {
        totalMissingAlt++;
      }

      if (img.format) {
        formatCounts[img.format] = (formatCounts[img.format] || 0) + 1;
      }

      if (img.format === "webp") {
        hasWebp = true;
      }
      if (img.format === "avif") {
        hasAvif = true;
      }
      if (img.isLazy) {
        hasLazyLoading = true;
      }
      if (img.isResponsive) {
        hasResponsiveImages = true;
      }
    }

    totalMissingAlt += pageImages.missingAltCount;
  }

  return {
    pages,
    allImages,
    totalMissingAlt,
    formatDistribution: formatCounts,
    hasWebp,
    hasAvif,
    hasLazyLoading,
    hasResponsiveImages,
  };
}

/**
 * Extracts images from a single HTML sample.
 * 
 * @param sample - HTML sample
 * @returns PageImages
 */
function extractPageImages(sample: HtmlSample): PageImages {
  const url = sample.url || "";
  const html = sample.html || "";

  try {
    const images: ImageData[] = [];
    const formats = new Set<string>();

    // Match img tags
    const imgRegex = /<img[^>]*>/gi;
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
      const imgTag = match[0];
      const imageData = parseImageTag(imgTag, url);
      
      if (imageData) {
        images.push(imageData);
        if (imageData.format) {
          formats.add(imageData.format);
        }
      }
    }

    // Also check for picture elements (source elements)
    const pictureRegex = /<picture[^>]*>[\s\S]*?<\/picture>/gi;
    while ((match = pictureRegex.exec(html)) !== null) {
      const pictureContent = match[0];
      const sourceRegex = /<source[^>]*>/gi;
      let sourceMatch;

      while ((sourceMatch = sourceRegex.exec(pictureContent)) !== null) {
        const sourceTag = sourceMatch[0];
        const srcset = extractAttribute(sourceTag, "srcset");
        const type = extractAttribute(sourceTag, "type");

        if (srcset) {
          // Extract format from type attribute or srcset
          let format: string | null = null;
          if (type) {
            if (type.includes("webp")) format = "webp";
            else if (type.includes("avif")) format = "avif";
            else if (type.includes("png")) format = "png";
            else if (type.includes("jpeg") || type.includes("jpg")) format = "jpeg";
          }

          images.push({
            src: srcset.split(",")[0].trim().split(" ")[0], // First src in srcset
            hasAlt: true, // Source elements don't have alt
            format,
            width: null,
            height: null,
            isLazy: false,
            isResponsive: true,
          });

          if (format) {
            formats.add(format);
          }
        }
      }
    }

    const missingAltCount = images.filter(img => !img.hasAlt).length;

    return {
      url,
      images,
      missingAltCount,
      totalImages: images.length,
      formats: Array.from(formats),
    };
  } catch {
    return {
      url,
      images: [],
      missingAltCount: 0,
      totalImages: 0,
      formats: [],
    };
  }
}

/**
 * Parses an image tag and extracts data.
 * 
 * @param imgTag - Image HTML tag
 * @param baseUrl - Base URL for resolving relative URLs
 * @returns ImageData or null
 */
function parseImageTag(imgTag: string, baseUrl: string): ImageData | null {
  const src = extractAttribute(imgTag, "src");
  
  if (!src) {
    return null;
  }

  // Resolve relative URL
  let absoluteSrc: string;
  try {
    absoluteSrc = new URL(src, baseUrl).toString();
  } catch {
    absoluteSrc = src;
  }

  const alt = extractAttribute(imgTag, "alt");
  const width = parseInt(extractAttribute(imgTag, "width") || "", 10) || null;
  const height = parseInt(extractAttribute(imgTag, "height") || "", 10) || null;
  const loading = extractAttribute(imgTag, "loading");
  const srcset = extractAttribute(imgTag, "srcset");
  const sizes = extractAttribute(imgTag, "sizes");

  const format = guessFormatFromUrl(absoluteSrc);

  return {
    src: absoluteSrc,
    hasAlt: alt !== null && alt.length > 0,
    altText: alt || undefined,
    format,
    width,
    height,
    isLazy: loading === "lazy",
    isResponsive: !!(srcset || sizes),
  };
}

/**
 * Guesses image format from URL extension.
 * 
 * @param url - Image URL
 * @returns Format string or null
 */
function guessFormatFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    
    // Check for extension
    const match = pathname.match(/\.([a-z0-9]+)(?:\?.*)?$/);
    if (match) {
      const ext = match[1];
      const formatMap: Record<string, string> = {
        "jpg": "jpeg",
        "jpeg": "jpeg",
        "png": "png",
        "gif": "gif",
        "svg": "svg",
        "webp": "webp",
        "avif": "avif",
        "bmp": "bmp",
        "ico": "ico",
        "tiff": "tiff",
        "tif": "tiff",
      };
      return formatMap[ext] || ext;
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts an attribute value from an HTML tag.
 */
function extractAttribute(tag: string, attrName: string): string | null {
  const regex = new RegExp(`${attrName}=["']([^"']*)["']`, "i");
  const match = tag.match(regex);
  return match ? match[1] : null;
}
