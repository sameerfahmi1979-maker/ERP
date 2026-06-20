/**
 * Structured server-side logger for ERP.
 *
 * In production (NODE_ENV=production) emits structured JSON so log aggregators
 * (Vercel, Datadog, etc.) can parse fields. In development, delegates to the
 * native console for readable output.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("Party created", { partyId: 42 });
 *   logger.error("DB insert failed", error);
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function emit(level: LogLevel, message: string, contextOrError?: LogContext | Error | unknown) {
  if (process.env.NODE_ENV === "production") {
    const payload: Record<string, unknown> = {
      level,
      ts: new Date().toISOString(),
      msg: message,
    };
    if (contextOrError instanceof Error) {
      payload.error = contextOrError.message;
      payload.stack = contextOrError.stack;
    } else if (contextOrError !== undefined) {
      payload.ctx = contextOrError;
    }
     
    console[level === "debug" ? "log" : level](JSON.stringify(payload));
  } else {
    const args: unknown[] = [message];
    if (contextOrError !== undefined) args.push(contextOrError);
     
    console[level === "debug" ? "log" : level](...args);
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit("debug", msg, ctx),
  info:  (msg: string, ctx?: LogContext) => emit("info", msg, ctx),
  warn:  (msg: string, ctx?: LogContext | Error | unknown) => emit("warn", msg, ctx),
  error: (msg: string, err?: Error | unknown) => emit("error", msg, err),
};
