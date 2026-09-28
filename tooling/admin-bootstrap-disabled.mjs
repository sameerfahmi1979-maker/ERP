// The historical bootstrap script silently ignored assignment lookup failures
// and did not guard existing administrators. Preserve it as local evidence only.
console.error("The legacy unrestricted admin bootstrap command is retired. Use the reviewed F03 identity/bootstrap runbook with an explicit target, preflight and separate authorization. No database connection was attempted.");
process.exitCode = 1;
