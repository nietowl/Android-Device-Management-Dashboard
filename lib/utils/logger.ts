/**
 * Production-Safe Logger Utility
 * 
 * This logger completely disables all logging in production to prevent
 * any information leakage. In development, it acts as a drop-in replacement
 * for console methods.
 * 
 * Usage:
 *   import logger from '@/lib/utils/logger';
 *   logger.log('Message');
 *   logger.error('Error message');
 */

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

// No-op functions for production (completely disabled)
const noop = () => {};

// Logger interface matching console API
interface Logger {
  log: (...args: any[]) => void;
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  trace: (...args: any[]) => void;
  table: (...args: any[]) => void;
  group: (...args: any[]) => void;
  groupEnd: () => void;
  groupCollapsed: (...args: any[]) => void;
  time: (label?: string) => void;
  timeEnd: (label?: string) => void;
  timeLog: (label?: string, ...args: any[]) => void;
  dir: (obj: any) => void;
  dirxml: (...args: any[]) => void;
  assert: (condition?: boolean, ...args: any[]) => void;
  count: (label?: string) => void;
  countReset: (label?: string) => void;
  clear: () => void;
}

// Create logger object
const logger: Logger = isProduction
  ? {
      // Production: All methods are no-ops (completely disabled)
      log: noop,
      info: noop,
      debug: noop,
      warn: noop,
      error: noop,
      trace: noop,
      table: noop,
      group: noop,
      groupEnd: noop,
      groupCollapsed: noop,
      time: noop,
      timeEnd: noop,
      timeLog: noop,
      dir: noop,
      dirxml: noop,
      assert: noop,
      count: noop,
      countReset: noop,
      clear: noop,
    }
  : {
      // Development: Use actual console methods
      log: console.log.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      trace: console.trace.bind(console),
      table: console.table.bind(console),
      group: console.group.bind(console),
      groupEnd: console.groupEnd.bind(console),
      groupCollapsed: console.groupCollapsed.bind(console),
      time: console.time.bind(console),
      timeEnd: console.timeEnd.bind(console),
      timeLog: console.timeLog.bind(console),
      dir: console.dir.bind(console),
      dirxml: console.dirxml.bind(console),
      assert: console.assert.bind(console),
      count: console.count.bind(console),
      countReset: console.countReset.bind(console),
      clear: console.clear.bind(console),
    };

export default logger;

// Named exports for convenience
export const { log, info, debug, warn, error, trace, table, group, groupEnd, groupCollapsed } = logger;

