/**
 * Extractor Types
 *
 * Type definitions for Layer 2 snapshot extraction.
 */

// ============================================================================
// Page Snapshot
// ============================================================================

export interface PageSnapshot {
  /** Page URL */
  url: string;
  /** Page title (from <title> tag) */
  title: string | null;
  /** Meta description */
  metaDescription: string | null;
  /** Meta robots directive */
  metaRobots: string | null;
  /** Canonical URL */
  canonical: string | null;
  /** All headings with levels */
  headings: HeadingInfo[];
  /** Navigation anchors (from nav elements) */
  navAnchors: AnchorInfo[];
  /** Count of internal links */
  internalLinkCount: number;
  /** Count of external links */
  externalLinkCount: number;
  /** Detected JSON-LD schema types */
  schemas: SchemaInfo[];
  /** Whether page has forms */
  hasForms: boolean;
  /** Open Graph metadata */
  openGraph: OpenGraphData;
  /** Twitter Card metadata */
  twitterCard: TwitterCardData;
  /** Image information */
  images: ImageInfo[];
  /** Language attribute */
  lang: string | null;
  /** Viewport meta tag */
  viewport: string | null;
  /** Charset declaration */
  charset: string | null;
  /** Hreflang declarations */
  hreflang: HreflangInfo[];
  /** Word count (approximate) */
  wordCount: number;
  /** Whether content appears thin */
  isThinContent: boolean;
}

// ============================================================================
// Supporting Types
// ============================================================================

export interface HeadingInfo {
  /** Heading level (1-6) */
  level: number;
  /** Heading text content */
  text: string;
  /** Position in document (approximate) */
  position: number;
}

export interface AnchorInfo {
  /** Link text */
  text: string;
  /** Link href */
  href: string;
  /** Whether it's internal */
  isInternal?: boolean;
}

export interface SchemaInfo {
  /** Schema.org type */
  type: string;
  /** Whether it has required properties */
  hasRequiredProps: boolean;
  /** Raw JSON-LD (truncated) */
  raw?: string;
}

export interface OpenGraphData {
  /** og:title */
  title: string | null;
  /** og:description */
  description: string | null;
  /** og:type */
  type: string | null;
  /** og:image */
  image: string | null;
  /** og:url */
  url: string | null;
  /** og:site_name */
  siteName: string | null;
}

export interface TwitterCardData {
  /** twitter:card */
  card: string | null;
  /** twitter:title */
  title: string | null;
  /** twitter:description */
  description: string | null;
  /** twitter:image */
  image: string | null;
  /** twitter:site */
  site: string | null;
}

export interface ImageInfo {
  /** Image src */
  src: string;
  /** Alt text */
  alt: string | null;
  /** Whether alt is missing */
  missingAlt: boolean;
  /** Width attribute */
  width: string | null;
  /** Height attribute */
  height: string | null;
  /** Loading attribute (lazy, eager) */
  loading: string | null;
  /** Whether it's likely above the fold */
  likelyAboveFold: boolean;
}

export interface HreflangInfo {
  /** Language/region code */
  lang: string;
  /** Alternate URL */
  href: string;
}

// ============================================================================
// Extraction Result
// ============================================================================

export interface ExtractionResult {
  /** Successfully extracted page snapshot */
  snapshot: PageSnapshot;
  /** Extraction warnings (non-fatal issues) */
  warnings: string[];
  /** Extraction errors (fatal issues) */
  errors: string[];
  /** Extraction duration in ms */
  durationMs: number;
}

// ============================================================================
// Multi-Page Extraction
// ============================================================================

export interface MultiPageSnapshot {
  /** Homepage snapshot */
  homepage: PageSnapshot;
  /** PDP snapshot (if provided) */
  pdp?: PageSnapshot;
  /** Additional page snapshots */
  additionalPages: PageSnapshot[];
  /** Summary statistics */
  summary: {
    totalPages: number;
    averageWordCount: number;
    totalSchemas: number;
    missingTitles: number;
    missingDescriptions: number;
    missingH1s: number;
  };
}
