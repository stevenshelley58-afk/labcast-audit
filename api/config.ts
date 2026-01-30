import type { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs } from 'fs';
import path from 'path';
import { AuditConfig } from '../types';
import { DEFAULT_AUDIT_CONFIG } from '../src/services/defaultConfig';

const CONFIG_FILE = path.join(process.cwd(), 'config', 'audit-config.json');

async function ensureConfigDir() {
  const configDir = path.dirname(CONFIG_FILE);
  try {
    await fs.access(configDir);
  } catch {
    await fs.mkdir(configDir, { recursive: true });
  }
}

async function loadConfig(): Promise<AuditConfig> {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    // Return default if file doesn't exist
    return DEFAULT_AUDIT_CONFIG;
  }
}

async function saveConfig(config: AuditConfig): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
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

      await saveConfig(config);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Config API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
