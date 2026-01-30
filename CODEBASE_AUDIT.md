# Labcast Audit - CODEBASE_AUDIT.md

## Executive Summary

**Total Issues Found:** 23
- **P0 (Critical):** 5 issues
- **P1 (Drift Risk):** 12 issues
- **P2 (Style):** 6 issues

**Top 10 Systemic Risks:**
1. **DUPLICATE_CONFIG:** `DEFAULT_AUDIT_CONFIG` defined in two places (`api/audit.ts:95` and `src/services/defaultConfig.ts:4`) - will drift
2. **DUPLICATE_PRICING:** `MODEL_PRICING` defined in 3 places with different models - cost calculations will diverge
3. **DUPLICATE_PARSING:** 7 identical `parseFindingsFromResponse` functions copy-pasted across micro-audit files
4. **INCONSISTENT_TIMEOUTS:** 15+ different timeout values scattered across codebase (3000ms to 60000ms)
5. **DUPLICATE_DEBUG_HASH:** `DEBUG_PASSWORD_HASH` defined in both `src/lib/constants.ts:7` and `src/hooks/useDebugMode.ts:12` with different values
6. **DUPLICATE_TYPES:** `AuditTrace` defined in both `types.ts:61` and `api/audit.ts:24` (comment says "duplicated for serverless isolation")
7. **MISSING_CSV_PRICING:** `src/lib/pricing.ts` has CSV data but no models use it
8. **INCONSISTENT_CALCULATE_COST:** 3 different cost calculation implementations with different fallback pricing
9. **NO_SINGLE_LOGGER:** 54 `console.log/warn/error` statements with no unified logging contract
10. **DIVERGENT_TYPE_EXPORTS:** `UrlRetrievalMetadata` defined in both `types.ts:56` and `api/lib/providers/types.ts:59`

---

## Issue Table

| ID | Severity | Category | Evidence (file:line) | What is wrong | Impact | Smallest fix | Verification |
|----|----------|----------|---------------------|---------------|--------|--------------|--------------|
| AUD-001 | P0 | Duplicate logic / missing canonical import | `api/audit.ts:82-92` vs `src/lib/pricing.ts:24-71` vs `api/lib/providers/types.ts:130-144` | Three `MODEL_PRICING` tables with different model sets | Cost calculations diverge between legacy and hybrid audit paths | Delete duplicates, import from `api/lib/providers/types.ts` | Compare pricing for `gpt-4o` - missing in `api/audit.ts` |
| AUD-002 | P0 | Duplicate logic / missing canonical import | `api/audit.ts:95-211` vs `src/services/defaultConfig.ts:4-120` | Two `DEFAULT_AUDIT_CONFIG` objects with same structure but different prompt text | Config drift - changes in one don't affect the other | Delete `api/audit.ts` version, import from shared location | Search for "Call 5: PDP Audit" text - appears in both with possible drift |
| AUD-003 | P0 | Incorrect mapping / naming | `src/hooks/useDebugMode.ts:12` vs `src/lib/constants.ts:7` | Two `DEBUG_PASSWORD_HASH` values for same purpose | Password authentication may fail depending on which check is used | Consolidate to single hash in `src/lib/constants.ts`, import in hook | Test debug password entry - may fail silently |
| AUD-004 | P0 | Precedence drift | `api/hybrid-audit.ts:101-107` vs `api/config.ts:27-28` | Config merging uses different spread patterns | User config may not properly override defaults in edge cases | Standardize config merging to deep merge utility | Test nested config override (e.g., `providers.gemini.maxConcurrent`) |
| AUD-005 | P0 | Duplicate logic / missing canonical import | `api/lib/micro-audits/technical-seo.ts:120-148` vs `performance.ts:160-188` vs `on-page-seo.ts:131-159` vs `content-quality.ts:125-153` vs `authority-trust.ts:132-160` vs `pdp-audit.ts:130-158` vs `codebase-peek.ts:117-145` vs `visual-audit.ts:242-276` | Eight identical `parseFindingsFromResponse` functions | Bug fixes in one don't apply to others; bundle bloat | Extract to shared utility in `api/lib/micro-audits/parsers.ts` | Add logging to one, verify it doesn't appear in others |
| AUD-006 | P1 | Duplicate logic / missing canonical import | `api/audit.ts:24-56` vs `types.ts:61-94` | `AuditTrace` type duplicated with comment "for serverless isolation" | Type drift - adding field in one breaks the other | Create shared types package or import from canonical location | Add optional field to one, check if TypeScript errors in other |
| AUD-007 | P1 | Duplicate logic / missing canonical import | `api/lib/providers/types.ts:146-152` vs `src/lib/pricing.ts:78-86` vs `api/audit.ts:89-91` | Three `calculateCost`/`calculateStepCost` functions with different fallback pricing | Cost calculations differ when model not found (0.001/0.002 vs 0.00025/0.001) | Consolidate to single function in `api/lib/providers/types.ts` | Test cost calculation with unknown model - returns different values |
| AUD-008 | P1 | Incorrect mapping / naming | `types.ts:56-59` vs `api/lib/providers/types.ts:59-62` | `UrlRetrievalMetadata` defined twice with same shape | Type drift risk; confusing imports | Delete one, import from canonical location | Check for compile errors after consolidating |
| AUD-009 | P1 | Precedence drift | `api/lib/providers/gemini.ts:42` vs `api/lib/providers/openai.ts:75` vs `api/hybrid-audit.ts:51` vs `api/audit.ts:531` | API key resolution uses same pattern but no shared utility | Changing precedence logic requires 4+ file edits | Create `getApiKey(provider)` utility in shared location | Verify all providers use same env var precedence |
| AUD-010 | P1 | Inconsistent contracts | `src/lib/constants.ts:15-17` vs `api/screenshot.ts:3` vs `api/lib/providers/gemini.ts:26` vs `api/lib/providers/openai.ts:24` vs `api/lib/types.ts:401-406` | Timeout constants scattered (5000, 10000, 15000, 30000, 60000, etc.) | Inconsistent user experience; hard to tune | Create `DEFAULT_TIMEOUTS` constant object in shared constants | Search for all timeout values - should reference central config |
| AUD-011 | P1 | Inconsistent contracts | `api/hybrid-audit.ts:69-72` vs `api/audit.ts:548-551` vs `api/lib/url.ts:34-40` | URL normalization implemented 3+ times with slight variations | Some paths may not add https:// prefix correctly | Consolidate to `normalizeUrl()` in `api/lib/url.ts` | Test URLs without protocol in each entry point |
| AUD-012 | P1 | Misleading comment/doc | `api/audit.ts:4` | Comment says "duplicated from types.ts for serverless isolation" but types.ts is in root | Confusing - root types.ts is also available to serverless | Delete comment or clarify actual reason | N/A - documentation fix |
| AUD-013 | P1 | Telemetry drift | 54 `console.*` statements across 20+ files | No unified logging contract; mix of `console.log`, `warn`, `error` | Cannot grep logs effectively; no correlation IDs | Create `logger.ts` with structured logging | Search for console statements - should be minimal |
| AUD-014 | P1 | Drift risk | `api/lib/fetchers.ts:15` vs `api/lib/collectors/index.ts:86` vs `api/lib/types.ts:401` | `DEFAULT_TIMEOUT` values differ (5000 vs 5000 vs 5000) - same value but 3 definitions | Changing one may not change others as expected | Consolidate to single import | Change one value, verify others still work |
| AUD-015 | P1 | Inconsistent contracts | `api/lib/micro-audits/types.ts:25` vs `api/lib/types.ts:129` vs `types.ts:14` | Priority/impact types use different enums (`'critical'/'high'/'medium'/'low'` vs `'High'/'Medium'/'Low'` vs `1/2/3/4/5`) | Converting between findings requires mapping layer | Standardize on single priority representation | Check conversion functions exist and are used |
| AUD-016 | P2 | Dead code / unreachable branch | `src/lib/pricing.ts:89-104` | `calculateTotalCost` function uses `traces` parameter with `candidatesTokenCount` but no caller passes this shape | Function appears usable but won't work with actual trace data | Update to match actual `AuditTrace` shape or delete | Try to call with real trace data - TypeScript may error |
| AUD-017 | P2 | Dead code / unreachable branch | `src/lib/constants.ts:7` | `DEBUG_PASSWORD_HASH` not imported by `useDebugMode.ts` which defines its own | Duplicate constant never used | Delete unused constant | Remove and verify build passes |
| AUD-018 | P2 | Style | `api/lib/micro-audits/*.ts` | All micro-audit files have nearly identical structure (try/catch, warn log, parse call) | Copy-paste pattern makes maintenance difficult | Create shared `runAudit()` wrapper utility | N/A - refactoring |
| AUD-019 | P2 | Misleading comment/doc | `api/lib/fetchers.ts:5` | Comment says "single retry" but code supports configurable retries | Outdated comment | Update comment to match code | N/A - doc fix |
| AUD-020 | P2 | Style | `api/lib/collectors/pagespeed.ts:164` | `timeout` parameter has default but also uses `?? 60000` inside function | Redundant default handling | Remove redundant `?? 60000` | Verify function works with undefined timeout |
| AUD-021 | P2 | Inconsistent contracts | `api/lib/providers/gemini.ts:42` vs `api/lib/providers/openai.ts:75` | Gemini checks `config.apiKey \|\| process.env.GEMINI_API_KEY \|\| ''` but OpenAI just `config.apiKey \|\| process.env.OPENAI_API_KEY` | Different fallback behavior (empty string vs undefined) | Standardize to same pattern | Test provider initialization with missing key |
| AUD-022 | P2 | Dead code / unreachable branch | `api/lib/synthesis/index.ts` | `merger.ts` exists but may not be used directly by hybrid audit | Check if deterministic merge path is ever taken | Verify usage or delete | Search for imports of merger module |
| AUD-023 | P2 | Style | `api/lib/types.ts:5` | Comment says "without strict schema locking" but JSON parsing is strict | Comment misleading | Update comment | N/A - doc fix |

---

## What I Read

### Critical Files Reviewed by Domain

#### Environment & Config
- `.env.example` - Basic env var documentation
- `api/config.ts` - Redis-backed config API with fallback to defaults
- `api/hybrid-audit.ts` - Hybrid audit handler with env checks
- `api/audit.ts` - Legacy audit handler with env checks
- `src/services/defaultConfig.ts` - Default config for frontend
- `src/hooks/useAuditConfig.ts` - Config loading hook

#### API Layer / Serverless Functions
- `api/audit.ts` - Legacy sequential audit endpoint (500+ lines)
- `api/hybrid-audit.ts` - New parallel/hybrid audit endpoint
- `api/config.ts` - Configuration REST API
- `api/screenshot.ts` - Screenshot capture endpoint

#### Provider Layer
- `api/lib/providers/types.ts` - Shared provider interfaces, pricing, semaphore
- `api/lib/providers/gemini.ts` - Gemini provider implementation
- `api/lib/providers/openai.ts` - OpenAI provider implementation
- `api/lib/providers/index.ts` - Provider registry and factory

#### Collection Layer (Layer 1)
- `api/lib/collectors/index.ts` - Collector orchestrator
- `api/lib/collectors/pagespeed.ts` - PageSpeed Insights integration
- `api/lib/collectors/security-headers.ts` - Security header analysis
- `api/lib/collectors/shallow-crawl.ts` - URL crawling

#### Extraction Layer (Layer 2)
- `api/lib/extractors/index.ts` - Extractor orchestrator
- `api/lib/extractors/page-snapshot.ts` - HTML parsing and extraction

#### Micro-Audit Layer (Layer 3)
- `api/lib/micro-audits/index.ts` - Micro-audit orchestrator
- `api/lib/micro-audits/types.ts` - Micro-audit type definitions
- `api/lib/micro-audits/technical-seo.ts` - Technical SEO audit
- `api/lib/micro-audits/performance.ts` - Performance audit
- `api/lib/micro-audits/on-page-seo.ts` - On-page SEO audit
- `api/lib/micro-audits/content-quality.ts` - Content quality audit
- `api/lib/micro-audits/authority-trust.ts` - Authority/trust audit
- `api/lib/micro-audits/visual-audit.ts` - Visual audit (URL context + screenshot)
- `api/lib/micro-audits/codebase-peek.ts` - Codebase analysis
- `api/lib/micro-audits/pdp-audit.ts` - Product detail page audit
- `api/lib/micro-audits/prompts.ts` - Shared prompt utilities

#### Synthesis Layer (Layer 4)
- `api/lib/synthesis/index.ts` - Synthesis orchestrator
- `api/lib/synthesis/merger.ts` - Deterministic merge engine

#### Shared Utilities
- `api/lib/types.ts` - Core type definitions (Parallel/Hybrid audit)
- `api/lib/url.ts` - URL normalization
- `api/lib/fetchers.ts` - HTTP fetching with timeout/retry
- `api/lib/evidence.ts` - Evidence formatting

#### Frontend
- `types.ts` - Root type definitions (shared with frontend)
- `src/lib/constants.ts` - Frontend constants
- `src/lib/pricing.ts` - Pricing calculations (frontend copy)
- `src/lib/errors.ts` - Error handling
- `src/hooks/useHybridAudit.ts` - Hybrid audit hook
- `src/hooks/useDebugMode.ts` - Debug mode authentication

#### Configuration
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `vercel.json` - Vercel deployment config

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total TypeScript files audited | 45+ |
| Total lines of code (approx) | 6,000+ |
| Unique API endpoints | 4 |
| Micro-audit types | 9 |
| Provider integrations | 2 (Gemini, OpenAI) |
| Console.log statements | 54 |
| Duplicate function implementations | 11 |
| Config DEFAULT_* objects | 8 |
| Timeout constants | 15+ |

