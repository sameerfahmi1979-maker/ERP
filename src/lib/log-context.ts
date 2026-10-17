// Universal logging seam: no Node, identity or worker dependency is imported
// into client code. Server-only scopes may install a request-local filter.
type Record = { message: string; context: unknown };
let filter: ((message: string, context: unknown) => Record) | undefined;
export function setServerLogContextFilter(value: (message: string, context: unknown) => Record) { filter = value; }
export function filterLogRecord(message: string, context: unknown): Record {
  return filter ? filter(message, context) : { message, context };
}
