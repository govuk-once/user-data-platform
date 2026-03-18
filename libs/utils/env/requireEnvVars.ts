import { MissingEnvironmentVariablesError, UDP_ERROR_TYPES } from '../Errors';

export function requireEnvVars<T extends string>(
  ...names: T[]
): { [K in T]: string } {
  const missing: string[] = [];
  const values = {} as { [K in T]: string };

  for (const name of names) {
    const value = process.env[name];
    if (value === undefined || values === '') {
      missing.push(name);
    } else {
      values[name] = value;
    }
  }

  if (missing.length > 0) {
    throw new MissingEnvironmentVariablesError(
      `Missing required environment variables: ${missing.join(', ')}`,
      UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
      missing,
    );
  }

  return values;
}
