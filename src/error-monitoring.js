import { init, globalHandlersIntegration } from "@sentry/browser";
import { sentryUsageEndpoint, usageDsn } from "./usage-analytics.js";

const ERROR_TYPES = new Set(["Error", "TypeError", "ReferenceError", "SyntaxError", "RangeError", "URIError", "EvalError", "AggregateError"]);

// Reconstruct a small diagnostic event instead of trying to redact arbitrary data.
export function sanitizeErrorEvent(event, origin) {
  if (event.type || !event.exception?.values?.length) return null;
  const values = event.exception.values.map(exception => {
    const frames = (exception.stacktrace?.frames || []).flatMap(frame => {
      try {
        const url = new URL(frame.filename);
        if (url.origin !== origin || !/^\/(?:assets|src)\/[a-zA-Z0-9_./-]+\.js$/.test(url.pathname)) return [];
        const result = { filename: `${origin}${url.pathname}`, in_app: true };
        for (const key of ["lineno", "colno"]) if (Number.isSafeInteger(frame[key]) && frame[key] > 0) result[key] = frame[key];
        return [result];
      } catch { return []; }
    });
    if (!frames.length) return null;
    return {
      type: ERROR_TYPES.has(exception.type) ? exception.type : "Error",
      value: "Unhandled application error",
      stacktrace: { frames: frames.slice(-30) },
      mechanism: { type: "generic", handled: false },
    };
  }).filter(Boolean);
  if (!values.length) return null;
  return {
    event_id: /^[a-f0-9]{32}$/.test(event.event_id || "") ? event.event_id : undefined,
    timestamp: event.timestamp,
    platform: "javascript", level: "error", environment: "production",
    exception: { values }, tags: { product: "shadow-mate" },
  };
}

export function installErrorMonitoring({
  dsn = usageDsn,
  origin = globalThis.location?.origin,
  isEnabled,
  initialize = init,
} = {}) {
  if (origin !== "https://sm.shadow.wang" || !sentryUsageEndpoint(dsn) || typeof isEnabled !== "function") return false;
  try {
    initialize({
      dsn, defaultIntegrations: false,
      integrations: [globalHandlersIntegration({ onerror: true, onunhandledrejection: true })],
      dataCollection: {
        userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
        graphQL: { document: false, variables: false }, genAI: { inputs: false, outputs: false },
        databaseQueryData: false, queues: false, stackFrameVariables: false, frameContextLines: 0,
      },
      sendClientReports: false, sampleRate: 1,
      beforeSend: event => isEnabled() ? sanitizeErrorEvent(event, origin) : null,
      beforeSendLog: () => null, beforeSendMetric: () => null,
      transportOptions: { fetchOptions: { credentials: "omit", referrerPolicy: "no-referrer" } },
    });
    return true;
  } catch { return false; }
}
