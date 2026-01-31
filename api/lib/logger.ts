/**
 * Simple structured logger for the audit system.
 * 
 * Provides consistent log formatting with component context.
 * Respects LOG_LEVEL environment variable (debug, info, warn, error).
 * 
 * Usage:
 *   import { logger } from './lib/logger.js';
 *   logger.info('AuditRunner', 'Starting audit', { url });
 *   logger.error('LLMClient', 'Request failed', error);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Get the minimum log level from environment
 */
function getMinLevel(): number {
  const level = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  return LOG_LEVELS[level] ?? LOG_LEVELS.info;
}

/**
 * Format a log message with timestamp and component
 */
function formatMessage(component: string, message: string): string {
  return `[${component}] ${message}`;
}

/**
 * Structured logger with component context
 */
export const logger = {
  /**
   * Debug-level logging (only shown when LOG_LEVEL=debug)
   */
  debug(component: string, message: string, meta?: unknown): void {
    if (getMinLevel() <= LOG_LEVELS.debug) {
      if (meta !== undefined) {
        console.debug(formatMessage(component, message), meta);
      } else {
        console.debug(formatMessage(component, message));
      }
    }
  },

  /**
   * Info-level logging (shown by default)
   */
  info(component: string, message: string, meta?: unknown): void {
    if (getMinLevel() <= LOG_LEVELS.info) {
      if (meta !== undefined) {
        console.log(formatMessage(component, message), meta);
      } else {
        console.log(formatMessage(component, message));
      }
    }
  },

  /**
   * Warning-level logging
   */
  warn(component: string, message: string, meta?: unknown): void {
    if (getMinLevel() <= LOG_LEVELS.warn) {
      if (meta !== undefined) {
        console.warn(formatMessage(component, message), meta);
      } else {
        console.warn(formatMessage(component, message));
      }
    }
  },

  /**
   * Error-level logging
   */
  error(component: string, message: string, error?: unknown): void {
    if (getMinLevel() <= LOG_LEVELS.error) {
      if (error !== undefined) {
        console.error(formatMessage(component, message), error);
      } else {
        console.error(formatMessage(component, message));
      }
    }
  },
};

export default logger;
