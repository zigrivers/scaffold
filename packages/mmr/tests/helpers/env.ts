/**
 * Restore a process.env var to a captured value, DELETING it when the captured
 * value was absent. A plain `process.env[key] = undefined` sets the literal
 * string 'undefined', which resolveSessionRoot/resolveJobsDir then treat as a
 * real path — leaking bogus state across parallel tests.
 */
export function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
