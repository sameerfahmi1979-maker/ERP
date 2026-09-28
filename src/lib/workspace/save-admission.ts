/** Same-mounted-form concurrency only; NOT a substitute for server idempotency. */
export function createSaveAdmission() {
  let busy = false;
  return {
    enter() { if (busy) return false; busy = true; return true; },
    leave() { busy = false; },
  };
}
