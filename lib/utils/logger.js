/**
 * Production-Safe Logger Utility (CommonJS)
 * 
 * This logger completely disables all logging in production to prevent
 * any information leakage. In development, it acts as a drop-in replacement
 * for console methods.
 * 
 * Usage:
 *   const logger = require('./lib/utils/logger');
 *   logger.log('Message');
 *   logger.error('Error message');
 */

const isProduction = process.env.NODE_ENV === 'production';

// No-op function for production (completely disabled)
const noop = () => {};

// Create logger object
const logger = isProduction
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

module.exports = logger;

