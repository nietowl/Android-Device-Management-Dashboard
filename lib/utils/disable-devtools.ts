/**
 * Disable Developer Tools in Production
 * Silently prevents users from accessing browser DevTools
 * No UI elements, no messages, completely invisible
 */

"use client";

export function disableDevTools() {
  // Only disable in production
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  // Execute silently - no console logs, no errors, no UI
  try {
    // Disable right-click context menu
    document.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      return false;
    });

    // Disable keyboard shortcuts for DevTools
    document.addEventListener("keydown", (e) => {
      // F12
      if (e.key === "F12") {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+I (Windows/Linux)
      // Cmd+Option+I (Mac)
      if (
        (e.ctrlKey && e.shiftKey && e.key === "I") ||
        (e.metaKey && e.altKey && e.key === "I")
      ) {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+J (Windows/Linux)
      // Cmd+Option+J (Mac)
      if (
        (e.ctrlKey && e.shiftKey && e.key === "J") ||
        (e.metaKey && e.altKey && e.key === "J")
      ) {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+C (Windows/Linux)
      // Cmd+Option+C (Mac)
      if (
        (e.ctrlKey && e.shiftKey && e.key === "C") ||
        (e.metaKey && e.altKey && e.key === "C")
      ) {
        e.preventDefault();
        return false;
      }

      // Ctrl+U (View Source)
      if (e.ctrlKey && e.key === "u") {
        e.preventDefault();
        return false;
      }

      // Ctrl+S (Save Page)
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        return false;
      }
    });

    // Clear console periodically (silently)
    setInterval(() => {
      try {
        console.clear();
      } catch (e) {
        // Silently fail if console is already blocked
      }
    }, 1000);

    // Detect DevTools opening silently (no UI feedback)
    let devtools = { open: false, orientation: null };
    const threshold = 160;

    setInterval(() => {
      if (
        window.outerHeight - window.innerHeight > threshold ||
        window.outerWidth - window.innerWidth > threshold
      ) {
        if (!devtools.open) {
          devtools.open = true;
          // Silently block - no console messages, no UI feedback
          // Just prevent access
        }
      } else {
        devtools.open = false;
      }
    }, 500);

    // Override console methods (disable all console output silently)
    const noop = () => {};
    const methods = [
      "log",
      "debug",
      "info",
      "warn",
      "error",
      "assert",
      "dir",
      "dirxml",
      "group",
      "groupEnd",
      "time",
      "timeEnd",
      "count",
      "trace",
      "profile",
      "profileEnd",
      "table",
      "clear",
    ];

    // Block console methods silently
    methods.forEach((method) => {
      try {
        // @ts-ignore
        console[method] = noop;
      } catch (e) {
        // Silently ignore errors
      }
    });

    // Prevent access to DevTools via console (silent blocking)
    try {
      Object.defineProperty(window, "console", {
        value: {},
        writable: false,
        configurable: false,
      });
    } catch (e) {
      // Silently ignore if already defined
    }

    // Block alert, confirm, prompt to prevent any popups
    try {
      window.alert = noop;
      window.confirm = () => false;
      window.prompt = () => null;
    } catch (e) {
      // Silently ignore
    }
  } catch (e) {
    // Silently fail - don't show any errors to users
  }
}
