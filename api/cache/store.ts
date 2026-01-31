/**
 * SEO Audit System - Cache Store
 * 
 * Simple in-memory cache with TTL support.
 * Keys: RawSnapshot, SiteSnapshot, PublicReport, PrivateFlags
 */

import type { CacheKeyType, CacheEntry } from "../audit.types.js";
import { CACHE_TTL_DEFAULT } from "../audit.config.js";

/**
 * Generic cache store interface.
 * Supports typed get/set operations with TTL.
 */
export interface CacheStore<T> {
  /**
   * Retrieves a value from the cache.
   * @param key - The cache key
   * @returns The cached value, or undefined if not found or expired
   */
  get(key: string): T | undefined;

  /**
   * Stores a value in the cache with an optional TTL.
   * @param key - The cache key
   * @param value - The value to cache
   * @param ttlMs - Time-to-live in milliseconds (defaults to CACHE_TTL_DEFAULT)
   */
  set(key: string, value: T, ttlMs?: number): void;

  /**
   * Checks if a key exists and is not expired.
   * @param key - The cache key
   * @returns true if key exists and is not expired
   */
  has(key: string): boolean;

  /**
   * Deletes a key from the cache.
   * @param key - The cache key
   * @returns true if key was deleted
   */
  delete(key: string): boolean;

  /**
   * Clears all cached entries.
   */
  clear(): void;

  /**
   * Returns the number of cached entries (including expired ones).
   */
  size(): number;

  /**
   * Removes expired entries from the cache.
   * @returns Number of entries removed
   */
  cleanup(): number;
}

/**
 * In-memory cache implementation using Map.
 * 
 * Features:
 * - TTL support with automatic expiration checking
 * - Cleanup method for removing expired entries
 * - Type-safe get/set operations
 */
export class InMemoryCache<T> implements CacheStore<T> {
  private storage: Map<string, CacheEntry<T>>;
  private defaultTtl: number;

  /**
   * Creates a new in-memory cache.
   * @param defaultTtl - Default TTL in milliseconds (defaults to 24 hours)
   */
  constructor(defaultTtl: number = CACHE_TTL_DEFAULT) {
    this.storage = new Map();
    this.defaultTtl = defaultTtl;
  }

  /**
   * Retrieves a value from the cache.
   * Returns undefined if key doesn't exist or has expired.
   */
  get(key: string): T | undefined {
    const entry = this.storage.get(key);
    
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.storage.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Stores a value in the cache.
   * TTL defaults to the cache's defaultTtl if not specified.
   */
  set(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtl;
    const expiresAt = Date.now() + ttl;
    
    this.storage.set(key, {
      value,
      expiresAt,
    });
  }

  /**
   * Checks if a key exists and is not expired.
   */
  has(key: string): boolean {
    const entry = this.storage.get(key);
    
    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.storage.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Deletes a key from the cache.
   */
  delete(key: string): boolean {
    return this.storage.delete(key);
  }

  /**
   * Clears all cached entries.
   */
  clear(): void {
    this.storage.clear();
  }

  /**
   * Returns the number of cached entries (including expired ones).
   */
  size(): number {
    return this.storage.size;
  }

  /**
   * Removes expired entries from the cache.
   * Returns the number of entries removed.
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.storage.entries()) {
      if (now > entry.expiresAt) {
        this.storage.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Gets all keys in the cache (including expired).
   */
  keys(): IterableIterator<string> {
    return this.storage.keys();
  }

  /**
   * Gets the remaining TTL for a key in milliseconds.
   * Returns 0 if key doesn't exist or is expired.
   */
  getRemainingTtl(key: string): number {
    const entry = this.storage.get(key);
    
    if (!entry) {
      return 0;
    }

    const remaining = entry.expiresAt - Date.now();
    return Math.max(0, remaining);
  }
}

/**
 * Typed cache key generator for different cache types.
 */
export function createCacheKey(
  type: CacheKeyType,
  identity: { cacheKey: string; normalizedUrl: string }
): string {
  return `${type}:${identity.cacheKey}:${identity.normalizedUrl}`;
}

/**
 * Cache instances for each audit stage.
 * These are singleton instances used across the audit system.
 */

import type {
  RawSnapshot,
  SiteSnapshot,
  PublicReport,
  PrivateFlags,
} from "../audit.types.js";
import {
  CACHE_TTL_RAW_SNAPSHOT,
  CACHE_TTL_SITE_SNAPSHOT,
  CACHE_TTL_PUBLIC_REPORT,
  CACHE_TTL_PRIVATE_FLAGS,
} from "../audit.config.js";

/**
 * Cache for RawSnapshot (Stage 1 collector outputs)
 */
export const rawSnapshotCache = new InMemoryCache<RawSnapshot>(
  CACHE_TTL_RAW_SNAPSHOT
);

/**
 * Cache for SiteSnapshot (Stage 2 extracted signals)
 */
export const siteSnapshotCache = new InMemoryCache<SiteSnapshot>(
  CACHE_TTL_SITE_SNAPSHOT
);

/**
 * Cache for PublicReport (Stage 4 client-facing report)
 */
export const publicReportCache = new InMemoryCache<PublicReport>(
  CACHE_TTL_PUBLIC_REPORT
);

/**
 * Cache for PrivateFlags (Stage 4 internal review)
 */
export const privateFlagsCache = new InMemoryCache<PrivateFlags>(
  CACHE_TTL_PRIVATE_FLAGS
);

/**
 * Map of cache types to their value types.
 */
export interface CacheTypeMap {
  rawSnapshot: RawSnapshot;
  siteSnapshot: SiteSnapshot;
  publicReport: PublicReport;
  privateFlags: PrivateFlags;
}

/**
 * Gets the appropriate cache for a given cache type.
 */
export function getCache<K extends CacheKeyType>(
  type: K
): CacheStore<CacheTypeMap[K]> {
  switch (type) {
    case "rawSnapshot":
      return rawSnapshotCache as unknown as CacheStore<CacheTypeMap[K]>;
    case "siteSnapshot":
      return siteSnapshotCache as unknown as CacheStore<CacheTypeMap[K]>;
    case "publicReport":
      return publicReportCache as unknown as CacheStore<CacheTypeMap[K]>;
    case "privateFlags":
      return privateFlagsCache as unknown as CacheStore<CacheTypeMap[K]>;
    default:
      throw new Error(`Unknown cache type: ${type}`);
  }
}

/**
 * Clears all caches.
 */
export function clearAllCaches(): void {
  rawSnapshotCache.clear();
  siteSnapshotCache.clear();
  publicReportCache.clear();
  privateFlagsCache.clear();
}

/**
 * Runs cleanup on all caches to remove expired entries.
 */
export function cleanupAllCaches(): { totalRemoved: number; details: Record<CacheKeyType, number> } {
  const details: Record<CacheKeyType, number> = {
    rawSnapshot: rawSnapshotCache.cleanup(),
    siteSnapshot: siteSnapshotCache.cleanup(),
    publicReport: publicReportCache.cleanup(),
    privateFlags: privateFlagsCache.cleanup(),
  };

  const totalRemoved = Object.values(details).reduce((sum, count) => sum + count, 0);

  return { totalRemoved, details };
}

/**
 * Gets cache statistics for monitoring.
 */
export function getCacheStats(): Record<CacheKeyType, { size: number; ttl: number }> {
  return {
    rawSnapshot: {
      size: rawSnapshotCache.size(),
      ttl: CACHE_TTL_RAW_SNAPSHOT,
    },
    siteSnapshot: {
      size: siteSnapshotCache.size(),
      ttl: CACHE_TTL_SITE_SNAPSHOT,
    },
    publicReport: {
      size: publicReportCache.size(),
      ttl: CACHE_TTL_PUBLIC_REPORT,
    },
    privateFlags: {
      size: privateFlagsCache.size(),
      ttl: CACHE_TTL_PRIVATE_FLAGS,
    },
  };
}
