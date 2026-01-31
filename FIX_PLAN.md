# Labcast Audit - Fix Plan

**Status:** ✅ Complete  
**Last Updated:** January 2025

## Summary

The codebase has been cleaned up. The original fix plan referenced a different codebase structure that no longer exists. The current codebase is well-organized.

## Fixes Applied

### 1. Pricing Consolidation ✅

**Issue:** Duplicate pricing calculation in `api/audit.ts`

**Fix:** Changed `api/audit.ts` to import `calculateTotalCost` from `src/lib/pricing.ts`

```typescript
// Before (inline pricing)
const totalCost = result.traces.reduce((sum, trace) => {
  const pricing: Record<string, ...> = { ... };  // Duplicate!
  ...
}, 0);

// After (shared module)
import { calculateTotalCost } from "../src/lib/pricing.js";
const totalCost = calculateTotalCost(result.traces);
```

### 2. Logger Utility ✅

**Issue:** 75+ console statements with no unified logging contract

**Fix:** Added `api/lib/logger.ts` with structured logging:

```typescript
import { logger } from './lib/logger.js';

logger.info('AuditRunner', 'Starting audit', { url });
logger.error('LLMClient', 'Request failed', error);
```

The logger:
- Respects `LOG_LEVEL` environment variable
- Provides consistent `[Component]` prefix
- Is optional - existing console calls still work fine

## Not Implemented (Intentionally)

These items from the original plan were evaluated and determined unnecessary:

1. **parseFindingsFromResponse extraction** - This function doesn't exist in the current codebase. The audit files have different structures.

2. **DEFAULT_AUDIT_CONFIG consolidation** - Only one config exists in `src/services/defaultConfig.ts`. No duplication.

3. **DEBUG_PASSWORD_HASH deduplication** - Only one hash exists in `src/hooks/useDebugMode.ts`. No duplication.

4. **Config deep merge** - Not needed with current flat config structure.

5. **Timeout constants consolidation** - Timeouts are well-organized in `api/audit.config.ts`.

## Verification

```bash
# Build passes
npm run build

# No duplicate pricing definitions
grep -rn "MODEL_PRICING" --include="*.ts" | grep "const"
# Returns: src/lib/pricing.ts:21 only

# Imports working correctly
grep "calculateTotalCost" api/audit.ts
# Returns: import statement
```

## Future Considerations

These are not bugs but could improve the codebase:

1. **Bundle Size** - 557KB is over Vite's 500KB warning. Consider:
   - Lazy loading the results view
   - Dynamic import for DebugOverlay

2. **Test Coverage** - No automated tests. Consider:
   - Unit tests for pricing calculations
   - Integration tests for API endpoint
   - E2E tests with Playwright

3. **Logging Migration** - Optionally migrate console calls to logger utility for:
   - Structured JSON logging in production
   - Log level filtering
   - Correlation IDs for request tracing
