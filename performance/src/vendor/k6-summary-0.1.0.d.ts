// Vendored from https://jslib.k6.io/k6-summary/0.1.0/index.js (Apache-2.0).
// Bundled locally because the perf CodeBuild project runs in isolated subnets
// with no internet access, so k6 cannot fetch remote modules at runtime.
export function textSummary(
  data: Record<string, unknown>,
  options?: { indent?: string; enableColors?: boolean },
): string;
export function jUnit(
  data: Record<string, unknown>,
  options?: { name?: string; classname?: string },
): string;
