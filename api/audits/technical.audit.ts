/**
 * Technical SEO Audit Module
 * 
 * Analyzes on-page SEO factors: titles, meta descriptions, headings,
 * canonicals, schema, internal links, and mixed content.
 * Produces deterministic findings - no network calls, no LLM calls.
 * Never throws, returns empty array if no findings.
 */

import type { SiteSnapshot, AuditFinding, PageSignals, RawSnapshot } from "../audit.types.js";
import { 
  TITLE_LENGTH_MIN, 
  TITLE_LENGTH_MAX, 
  META_DESC_LENGTH_MIN, 
  META_DESC_LENGTH_MAX 
} from "../audit.config.js";

/**
 * Runs technical SEO audit on SiteSnapshot.
 * 
 * @param snapshot - SiteSnapshot from extractors
 * @param raw - RawSnapshot for additional data access
 * @returns Array of technical findings
 */
export function auditTechnical(snapshot: SiteSnapshot, raw: RawSnapshot): AuditFinding[] {
  const findings: AuditFinding[] = [];

  try {
    // Check title issues
    const titleFindings = checkTitleIssues(snapshot.pages);
    findings.push(...titleFindings);

    // Check meta description issues
    const metaDescFindings = checkMetaDescriptionIssues(snapshot.pages);
    findings.push(...metaDescFindings);

    // Check heading issues
    const headingFindings = checkHeadingIssues(snapshot.pages);
    findings.push(...headingFindings);

    // Check canonical issues
    const canonicalFindings = checkCanonicalIssues(snapshot.pages);
    findings.push(...canonicalFindings);

    // Check schema issues
    const schemaFindings = checkSchemaIssues(snapshot.pages);
    findings.push(...schemaFindings);

    // Check internal broken links
    const brokenLinkFindings = checkBrokenLinks(snapshot.pages);
    findings.push(...brokenLinkFindings);

    // Check mixed content
    const mixedContentFindings = checkMixedContent(snapshot.pages);
    findings.push(...mixedContentFindings);

    // Check viewport and charset
    const viewportFindings = checkViewportCharset(snapshot.pages);
    findings.push(...viewportFindings);

  } catch {
    // Never throw - return findings collected so far
  }

  return findings;
}

/**
 * Checks for title issues (missing, duplicate, too long/short).
 */
function checkTitleIssues(pages: PageSignals[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (pages.length === 0) {
    return findings;
  }

  // Track titles for duplicates
  const titleMap = new Map<string, string[]>();
  const missingTitles: string[] = [];
  const tooLongTitles: Array<{ url: string; title: string; length: number }> = [];
  const tooShortTitles: Array<{ url: string; title: string; length: number }> = [];

  for (const page of pages) {
    if (!page.title) {
      missingTitles.push(page.url);
    } else {
      // Track for duplicates
      const normalizedTitle = page.title.toLowerCase().trim();
      const existing = titleMap.get(normalizedTitle) || [];
      existing.push(page.url);
      titleMap.set(normalizedTitle, existing);

      // Check length
      if (page.titleLength > TITLE_LENGTH_MAX) {
        tooLongTitles.push({ url: page.url, title: page.title, length: page.titleLength });
      } else if (page.titleLength < TITLE_LENGTH_MIN) {
        tooShortTitles.push({ url: page.url, title: page.title, length: page.titleLength });
      }
    }
  }

  // Missing titles
  if (missingTitles.length > 0) {
    findings.push({
      type: "tech_missing_title",
      severity: "critical",
      message: `${missingTitles.length} pages are missing title tags`,
      evidence: {
        affectedCount: missingTitles.length,
        sampleUrls: missingTitles.slice(0, 10),
      },
      affectedUrls: missingTitles.slice(0, 20),
    });
  }

  // Duplicate titles
  const duplicates = Array.from(titleMap.entries()).filter(([_, urls]) => urls.length > 1);
  if (duplicates.length > 0) {
    const totalDuplicatePages = duplicates.reduce((sum, [_, urls]) => sum + urls.length, 0);
    findings.push({
      type: "tech_duplicate_title",
      severity: "warning",
      message: `${totalDuplicatePages} pages have duplicate titles (${duplicates.length} unique duplicates)`,
      evidence: {
        duplicateGroups: duplicates.slice(0, 5).map(([title, urls]) => ({
          title: title.slice(0, 60),
          urlCount: urls.length,
          sampleUrls: urls.slice(0, 3),
        })),
      },
      affectedUrls: duplicates.flatMap(([_, urls]) => urls).slice(0, 20),
    });
  }

  // Too long titles
  if (tooLongTitles.length > 0) {
    findings.push({
      type: "tech_title_too_long",
      severity: "info",
      message: `${tooLongTitles.length} pages have titles longer than ${TITLE_LENGTH_MAX} characters`,
      evidence: {
        affectedCount: tooLongTitles.length,
        maxLength: Math.max(...tooLongTitles.map(t => t.length)),
        samples: tooLongTitles.slice(0, 5).map(t => ({ url: t.url, length: t.length })),
      },
      affectedUrls: tooLongTitles.map(t => t.url).slice(0, 10),
    });
  }

  // Too short titles
  if (tooShortTitles.length > 0) {
    findings.push({
      type: "tech_title_too_short",
      severity: "info",
      message: `${tooShortTitles.length} pages have titles shorter than ${TITLE_LENGTH_MIN} characters`,
      evidence: {
        affectedCount: tooShortTitles.length,
        samples: tooShortTitles.slice(0, 5).map(t => ({ url: t.url, length: t.length })),
      },
      affectedUrls: tooShortTitles.map(t => t.url).slice(0, 10),
    });
  }

  return findings;
}

/**
 * Checks for meta description issues.
 */
function checkMetaDescriptionIssues(pages: PageSignals[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (pages.length === 0) {
    return findings;
  }

  // Track descriptions for duplicates
  const descMap = new Map<string, string[]>();
  const missingDescs: string[] = [];
  const tooLongDescs: Array<{ url: string; length: number }> = [];

  for (const page of pages) {
    if (!page.metaDescription) {
      missingDescs.push(page.url);
    } else {
      // Track for duplicates
      const normalizedDesc = page.metaDescription.toLowerCase().trim();
      const existing = descMap.get(normalizedDesc) || [];
      existing.push(page.url);
      descMap.set(normalizedDesc, existing);

      // Check length
      if (page.metaDescriptionLength > META_DESC_LENGTH_MAX) {
        tooLongDescs.push({ url: page.url, length: page.metaDescriptionLength });
      }
    }
  }

  // Missing descriptions
  if (missingDescs.length > 0) {
    findings.push({
      type: "tech_missing_meta_desc",
      severity: "warning",
      message: `${missingDescs.length} pages are missing meta descriptions`,
      evidence: {
        affectedCount: missingDescs.length,
        sampleUrls: missingDescs.slice(0, 10),
      },
      affectedUrls: missingDescs.slice(0, 20),
    });
  }

  // Duplicate descriptions
  const duplicates = Array.from(descMap.entries()).filter(([_, urls]) => urls.length > 1);
  if (duplicates.length > 0) {
    const totalDuplicatePages = duplicates.reduce((sum, [_, urls]) => sum + urls.length, 0);
    findings.push({
      type: "tech_duplicate_meta_desc",
      severity: "warning",
      message: `${totalDuplicatePages} pages have duplicate meta descriptions`,
      evidence: {
        duplicateGroups: duplicates.slice(0, 5).map(([desc, urls]) => ({
          description: desc.slice(0, 100),
          urlCount: urls.length,
          sampleUrls: urls.slice(0, 3),
        })),
      },
      affectedUrls: duplicates.flatMap(([_, urls]) => urls).slice(0, 20),
    });
  }

  // Too long descriptions
  if (tooLongDescs.length > 0) {
    findings.push({
      type: "tech_meta_desc_too_long",
      severity: "info",
      message: `${tooLongDescs.length} pages have meta descriptions longer than ${META_DESC_LENGTH_MAX} characters`,
      evidence: {
        affectedCount: tooLongDescs.length,
        maxLength: Math.max(...tooLongDescs.map(d => d.length)),
      },
      affectedUrls: tooLongDescs.map(d => d.url).slice(0, 10),
    });
  }

  return findings;
}

/**
 * Checks for heading issues (missing H1, multiple H1s, hierarchy).
 */
function checkHeadingIssues(pages: PageSignals[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (pages.length === 0) {
    return findings;
  }

  const missingH1: string[] = [];
  const multipleH1: Array<{ url: string; count: number }> = [];
  const hierarchyIssues: Array<{ url: string; issue: string }> = [];

  for (const page of pages) {
    // Check H1 issues
    if (page.h1Count === 0) {
      missingH1.push(page.url);
    } else if (page.h1Count > 1) {
      multipleH1.push({ url: page.url, count: page.h1Count });
    }

    // Check heading hierarchy (skip levels)
    const headings = page.headings;
    const hasH2 = headings.h2.length > 0;
    const hasH3 = headings.h3.length > 0;
    const hasH4 = headings.h4.length > 0;

    if (hasH3 && !hasH2) {
      hierarchyIssues.push({ url: page.url, issue: "H3 without H2" });
    }
    if (hasH4 && !hasH3) {
      hierarchyIssues.push({ url: page.url, issue: "H4 without H3" });
    }
  }

  // Missing H1
  if (missingH1.length > 0) {
    findings.push({
      type: "tech_missing_h1",
      severity: "warning",
      message: `${missingH1.length} pages are missing H1 tags`,
      evidence: {
        affectedCount: missingH1.length,
        sampleUrls: missingH1.slice(0, 10),
      },
      affectedUrls: missingH1.slice(0, 20),
    });
  }

  // Multiple H1s
  if (multipleH1.length > 0) {
    findings.push({
      type: "tech_multiple_h1",
      severity: "info",
      message: `${multipleH1.length} pages have multiple H1 tags`,
      evidence: {
        affectedCount: multipleH1.length,
        maxH1Count: Math.max(...multipleH1.map(p => p.count)),
        samples: multipleH1.slice(0, 5).map(p => ({ url: p.url, count: p.count })),
      },
      affectedUrls: multipleH1.map(p => p.url).slice(0, 10),
    });
  }

  // Hierarchy issues
  if (hierarchyIssues.length > 0) {
    findings.push({
      type: "tech_missing_h1", // Using as generic heading issue
      severity: "info",
      message: `${hierarchyIssues.length} pages have heading hierarchy issues`,
      evidence: {
        affectedCount: hierarchyIssues.length,
        issueTypes: [...new Set(hierarchyIssues.map(h => h.issue))],
        samples: hierarchyIssues.slice(0, 5),
      },
      affectedUrls: hierarchyIssues.map(h => h.url).slice(0, 10),
    });
  }

  return findings;
}

/**
 * Checks for canonical issues.
 */
function checkCanonicalIssues(pages: PageSignals[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (pages.length === 0) {
    return findings;
  }

  const missingCanonical: string[] = [];
  const nonSelfCanonical: Array<{ url: string; canonical: string }> = [];

  for (const page of pages) {
    if (!page.canonical) {
      missingCanonical.push(page.url);
    } else if (!page.canonicalSelf) {
      nonSelfCanonical.push({ url: page.url, canonical: page.canonical });
    }
  }

  // Missing canonical
  if (missingCanonical.length > 0) {
    findings.push({
      type: "tech_missing_canonical",
      severity: "warning",
      message: `${missingCanonical.length} pages are missing canonical tags`,
      evidence: {
        affectedCount: missingCanonical.length,
        sampleUrls: missingCanonical.slice(0, 10),
      },
      affectedUrls: missingCanonical.slice(0, 20),
    });
  }

  // Non-self canonical (could be intentional, but worth noting)
  if (nonSelfCanonical.length > 0) {
    findings.push({
      type: "tech_canonical_mismatch",
      severity: "info",
      message: `${nonSelfCanonical.length} pages have non-self-referencing canonicals`,
      evidence: {
        affectedCount: nonSelfCanonical.length,
        samples: nonSelfCanonical.slice(0, 5).map(c => ({
          url: c.url,
          canonical: c.canonical,
        })),
      },
      affectedUrls: nonSelfCanonical.map(c => c.url).slice(0, 10),
    });
  }

  return findings;
}

/**
 * Checks for schema issues.
 */
function checkSchemaIssues(pages: PageSignals[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (pages.length === 0) {
    return findings;
  }

  // Check for PDP pages without product schema
  const pagesWithoutProductSchema: Array<{ url: string; types: string[] }> = [];
  const pagesWithInvalidSchema: Array<{ url: string; errors: string[] }> = [];

  for (const page of pages) {
    const isProductPage = 
      page.url.includes("/product") || 
      page.url.includes("/item") ||
      page.url.includes("/p/");

    const hasProductSchema = page.schema.some(s => 
      s.type.toLowerCase().includes("product")
    );

    if (isProductPage && !hasProductSchema) {
      pagesWithoutProductSchema.push({
        url: page.url,
        types: page.schema.map(s => s.type),
      });
    }

    // Check for invalid schema
    const invalidSchemas = page.schema.filter(s => !s.valid && s.errors);
    if (invalidSchemas.length > 0) {
      pagesWithInvalidSchema.push({
        url: page.url,
        errors: invalidSchemas.flatMap(s => s.errors || []),
      });
    }
  }

  // Missing product schema on PDPs
  if (pagesWithoutProductSchema.length > 0) {
    findings.push({
      type: "tech_missing_viewport", // Using as placeholder for schema issue
      severity: "warning",
      message: `${pagesWithoutProductSchema.length} product pages missing Product schema markup`,
      evidence: {
        affectedCount: pagesWithoutProductSchema.length,
        hasOtherSchema: pagesWithoutProductSchema.filter(p => p.types.length > 0).length,
        sampleUrls: pagesWithoutProductSchema.slice(0, 5).map(p => p.url),
      },
      affectedUrls: pagesWithoutProductSchema.map(p => p.url).slice(0, 10),
    });
  }

  // Invalid schema
  if (pagesWithInvalidSchema.length > 0) {
    findings.push({
      type: "tech_missing_viewport",
      severity: "info",
      message: `${pagesWithInvalidSchema.length} pages have schema validation errors`,
      evidence: {
        affectedCount: pagesWithInvalidSchema.length,
        errorSamples: pagesWithInvalidSchema.slice(0, 3).map(p => ({
          url: p.url,
          errors: p.errors.slice(0, 3),
        })),
      },
      affectedUrls: pagesWithInvalidSchema.map(p => p.url).slice(0, 10),
    });
  }

  return findings;
}

/**
 * Checks for broken internal links.
 */
function checkBrokenLinks(pages: PageSignals[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (pages.length === 0) {
    return findings;
  }

  // Collect all broken links
  const allBrokenLinks = new Map<string, string[]>(); // URL -> pages linking to it

  for (const page of pages) {
    for (const brokenUrl of page.links.broken) {
      const existing = allBrokenLinks.get(brokenUrl) || [];
      existing.push(page.url);
      allBrokenLinks.set(brokenUrl, existing);
    }
  }

  if (allBrokenLinks.size > 0) {
    const totalBrokenLinks = allBrokenLinks.size;
    const affectedPages = new Set(
      Array.from(allBrokenLinks.values()).flat()
    ).size;

    findings.push({
      type: "tech_broken_links",
      severity: "warning",
      message: `${totalBrokenLinks} broken internal links found across ${affectedPages} pages`,
      evidence: {
        brokenLinkCount: totalBrokenLinks,
        affectedPageCount: affectedPages,
        sampleBrokenLinks: Array.from(allBrokenLinks.entries()).slice(0, 10).map(([url, sources]) => ({
          url,
          sourceCount: sources.length,
          sampleSources: sources.slice(0, 3),
        })),
      },
      affectedUrls: Array.from(allBrokenLinks.keys()).slice(0, 20),
    });
  }

  return findings;
}

/**
 * Checks for mixed content issues.
 */
function checkMixedContent(pages: PageSignals[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (pages.length === 0) {
    return findings;
  }

  const pagesWithMixedContent = pages.filter(p => p.mixedContent);

  if (pagesWithMixedContent.length > 0) {
    findings.push({
      type: "sec_mixed_content",
      severity: "critical",
      message: `${pagesWithMixedContent.length} pages have mixed content (HTTP assets on HTTPS pages)`,
      evidence: {
        affectedCount: pagesWithMixedContent.length,
        sampleUrls: pagesWithMixedContent.slice(0, 10).map(p => p.url),
      },
      affectedUrls: pagesWithMixedContent.map(p => p.url).slice(0, 20),
    });
  }

  return findings;
}

/**
 * Checks for viewport and charset issues.
 */
function checkViewportCharset(pages: PageSignals[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (pages.length === 0) {
    return findings;
  }

  const missingViewport = pages.filter(p => !p.hasViewport);
  const missingCharset = pages.filter(p => !p.hasCharset);
  const missingLang = pages.filter(p => !p.hasLang);

  if (missingViewport.length > 0) {
    findings.push({
      type: "tech_missing_viewport",
      severity: "warning",
      message: `${missingViewport.length} pages are missing viewport meta tag`,
      evidence: {
        affectedCount: missingViewport.length,
        sampleUrls: missingViewport.slice(0, 10).map(p => p.url),
      },
      affectedUrls: missingViewport.map(p => p.url).slice(0, 20),
    });
  }

  if (missingCharset.length > 0) {
    findings.push({
      type: "tech_missing_charset",
      severity: "info",
      message: `${missingCharset.length} pages are missing charset declaration`,
      evidence: {
        affectedCount: missingCharset.length,
        sampleUrls: missingCharset.slice(0, 10).map(p => p.url),
      },
      affectedUrls: missingCharset.map(p => p.url).slice(0, 10),
    });
  }

  if (missingLang.length > 0) {
    findings.push({
      type: "tech_missing_lang",
      severity: "info",
      message: `${missingLang.length} pages are missing lang attribute`,
      evidence: {
        affectedCount: missingLang.length,
        sampleUrls: missingLang.slice(0, 10).map(p => p.url),
      },
      affectedUrls: missingLang.map(p => p.url).slice(0, 10),
    });
  }

  return findings;
}
