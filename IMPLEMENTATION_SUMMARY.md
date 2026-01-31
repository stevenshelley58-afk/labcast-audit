# Labcast Audit - Implementation Summary

## Overview

A Gemini-powered website auditing system with a 5-stage pipeline that analyzes websites across multiple dimensions (SEO, performance, security, visual UX).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        API Endpoint (audit.ts)                       │
│                    POST /api/audit { url: string }                  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Pipeline Runner (audit.runner.ts)                │
│                                                                     │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌───────┐│
│  │ Stage 0 │ → │ Stage 1 │ → │ Stage 2 │ → │ Stage 3 │ → │Stage 4││
│  │Identity │   │ Collect │   │ Extract │   │  Audit  │   │Synth  ││
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘   └───────┘│
└─────────────────────────────────────────────────────────────────────┘
```

## 5-Stage Pipeline

### Stage 0: Identity
- URL normalization
- Run ID generation
- Cache key computation

### Stage 1: Collection (`api/collectors/`)

Parallel data gathering from 13 sources:

| Collector | Purpose |
|-----------|---------|
| `fetchRoot.ts` | Fetch root HTML document |
| `robots.ts` | Parse robots.txt directives |
| `sitemap.ts` | Discover and parse sitemaps |
| `redirects.ts` | Trace redirect chains |
| `htmlSample.ts` | Sample internal pages |
| `dns.ts` | DNS records and configuration |
| `tls.ts` | SSL/TLS certificate info |
| `wellKnown.ts` | .well-known directory files |
| `screenshots.ts` | Visual captures (ScreenshotOne API) |
| `lighthouse.ts` | Performance metrics |
| `serp.ts` | Search engine rankings |
| `squirrelscan.ts` | Security scan integration |
| `collectAll.ts` | Orchestrates all collectors |

### Stage 2: Extraction (`api/extractors/`)

Signal extraction from collected data:

| Extractor | Purpose |
|-----------|---------|
| `htmlSignals.ts` | On-page SEO signals |
| `schema.ts` | Structured data parsing |
| `links.ts` | Internal/external link analysis |
| `images.ts` | Image optimization signals |
| `perf.ts` | Performance indicators |
| `securityHeaders.ts` | Security header analysis |
| `infra.ts` | Infrastructure detection |
| `coverage.ts` | Content coverage metrics |
| `urlset.ts` | URL pattern analysis |
| `extractAll.ts` | Orchestrates all extractors |

### Stage 3: Audits (`api/audits/`)

Six specialized audits (4 deterministic + 2 LLM):

| Audit | Type | LLM | Description |
|-------|------|-----|-------------|
| `crawl.audit.ts` | Deterministic | No | Crawl accessibility |
| `technical.audit.ts` | Deterministic | No | Technical SEO |
| `security.audit.ts` | Deterministic | No | Security posture |
| `performance.audit.ts` | Deterministic | No | Performance metrics |
| `visual.audit.ts` | LLM | Gemini | UX/Design analysis |
| `serp.audit.ts` | LLM | Gemini | SERP analysis |

### Stage 4: Synthesis (`api/synthesis/`)

- 3rd LLM call (after visual + SERP)
- Combines all findings into executive report
- Generates priorities and recommendations

## Key Design Principles

1. **Never Throw** - All collectors and audits return `{ data, error }` - pipeline never crashes
2. **Graceful Degradation** - Missing data doesn't fail the audit
3. **Bounded Concurrency** - Collectors use concurrency limits
4. **3 LLM Calls Max** - Visual audit, SERP audit, synthesis
5. **Private Flags** - Security-sensitive findings kept separate from public report

## LLM Integration (`api/llm/`)

| File | Purpose |
|------|---------|
| `client.ts` | Unified Gemini + OpenAI client |
| `prompts.ts` | Prompt templates |
| `redact.ts` | Sensitive data redaction |

## Frontend (`src/`)

| Directory | Purpose |
|-----------|---------|
| `components/` | React UI components |
| `hooks/` | State management hooks |
| `services/` | API client |
| `lib/` | Utilities (pricing, constants, errors) |

## Configuration

| File | Purpose |
|------|---------|
| `api/audit.config.ts` | Timeouts, limits, thresholds |
| `api/audit.types.ts` | Type definitions |
| `src/services/defaultConfig.ts` | LLM prompt templates |
| `src/lib/pricing.ts` | Model pricing (canonical) |

## Deployment

- **Platform:** Vercel
- **Function:** `api/audit.ts` (serverless)
- **Screenshot API:** ScreenshotOne
- **Auto-deploy:** Push to main triggers deployment
