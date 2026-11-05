/** A real operation failure, separate from validation, warnings and message colour.
 * Applications subscribe to `ds-failure`; this module never sends network requests.
 * Use an authored, stable code and summary, never user content or a server response.
 */
export interface Failure {
  code: string;
  message: string;
  /** Original caught error; only its stack frames enter the diagnostic. */
  error?: unknown;
  /** Captured at reporting time so startup handoff keeps the original call site. */
  stack?: string;
}
export const FAILURE_EVENT = "ds-failure";
/** A bounded handoff for failures shown before the application reporter starts. */
const PENDING = Symbol.for("design-system-1.pending-failures");

/** Report a failed operation. Safe during server rendering; no DOM text is read. */
export function reportFailure(failure: Failure): void {
  if (typeof window === "undefined" || typeof failure?.code !== "string" || typeof failure.message !== "string" || !/^[a-z][a-z0-9_.-]{0,79}$/.test(failure.code) || !failure.message.trim()) return;
  const source = failure.error instanceof Error ? failure.error : new Error();
  const stack = (failure.stack ?? source.stack ?? "").split("\n")
    .filter(line => /^\s*at\s/.test(line) || /@.*:\d+/.test(line))
    .slice(0, 8).join("\n").trim().slice(0, 500);
  const detail = { code: failure.code, message: failure.message.trim().slice(0, 200), ...(stack ? { stack } : {}) };
  // A reporter acknowledges by preventing the default: queueing for later.
  if (window.dispatchEvent(new CustomEvent<Failure>(FAILURE_EVENT, { detail, cancelable: true }))) {
    const scope = globalThis as unknown as Record<symbol, Failure[] | undefined>;
    const pending = scope[PENDING] ??= [];
    pending.push(detail);
    if (pending.length > 20) pending.shift();
  }
}
