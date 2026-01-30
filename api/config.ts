import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { AuditConfig } from '../types';
import { DEFAULT_AUDIT_CONFIG } from '../src/services/defaultConfig';

const CONFIG_KEY = 'audit-config';

// Initialize Redis client (uses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars)
function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

async function loadConfig(): Promise<AuditConfig> {
  const redis = getRedis();
  if (!redis) {
    console.warn('Redis not configured, using defaults');
    return DEFAULT_AUDIT_CONFIG;
  }

  try {
    const config = await redis.get<AuditConfig>(CONFIG_KEY);
    return config || DEFAULT_AUDIT_CONFIG;
  } catch (error) {
    console.error('Failed to load config from Redis:', error);
    return DEFAULT_AUDIT_CONFIG;
  }
}

async function saveConfig(config: AuditConfig): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    console.warn('Redis not configured, cannot save');
    return false;
  }

  try {
    await redis.set(CONFIG_KEY, config);
    return true;
  } catch (error) {
    console.error('Failed to save config to Redis:', error);
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const config = await loadConfig();
      return res.status(200).json(config);
    }

    if (req.method === 'POST') {
      const config = req.body as AuditConfig;

      if (!config || !config.steps) {
        return res.status(400).json({ error: 'Invalid config format' });
      }

      const saved = await saveConfig(config);
      if (!saved) {
        return res.status(500).json({ error: 'Failed to save config - Redis not configured' });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Config API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
