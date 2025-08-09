// Put this in a utility file and import it in your main layout
export function setupConsoleFiltering() {
  // Store original methods
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  };

  const suppressPatterns = [
    // Twitch playback messages
    /playback-monitor/,
    /Config changed/,
    /Moving to buffered region/,
    /Play - moving to buffered region/,

    // React Router warnings
    /React Router Future Flag Warning/,
    /v7_startTransition/,
    /v7_relativeSplatPath/,

    // Twitch API errors
    /passport\.twitch\.tv/,
    /gql\.twitch\.tv/,
    /x-kpsdk-v/,
    /Too Many Requests/,
    /429 \(Too Many Requests\)/,

    // GraphQL errors - multiple patterns to catch variations
    /\[GraphQL\]/i,
    /One or more GraphQL errors were detected/i,
    /GraphQL errors were detected on request/i,
    /PlaybackAccessToken/i,
    /PinnedChatSettings/i,
    /unauthenticated/i,
    /server error/i,

    // Request IDs that are common in GraphQL errors
    /01K25[A-Z0-9]+/,

    // General Twitch error patterns
    /player-core-variant/,
    /twitch\.tv.*error/i,

    // VM script errors (often from ads/analytics)
    /^VM\d+:/,
  ];

  const shouldSuppress = (args: any[]) => {
    // Convert all arguments to strings and join them
    const message = args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (typeof arg === 'object') return JSON.stringify(arg);
        return String(arg);
      })
      .join(' ');

    return suppressPatterns.some((pattern) => pattern.test(message));
  };

  // Override all console methods
  console.log = (...args) => {
    if (!shouldSuppress(args)) originalConsole.log(...args);
  };

  console.warn = (...args) => {
    if (!shouldSuppress(args)) originalConsole.warn(...args);
  };

  console.error = (...args) => {
    if (!shouldSuppress(args)) originalConsole.error(...args);
  };

  console.info = (...args) => {
    if (!shouldSuppress(args)) originalConsole.info(...args);
  };

  console.debug = (...args) => {
    if (!shouldSuppress(args)) originalConsole.debug(...args);
  };

  // Return a function to restore original console if needed
  return () => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
  };
}
