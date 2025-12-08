export interface CompositeKey {
  pk: string;
  sk: string;
}

/**
 * Extracts a composite key (partition key and sort key) from API Gateway path parameters.
 *
 * Expects the last two path segments to represent the partition key (pk) and sort key (sk).
 * For example, "/users/user#123/profile#456" would extract:
 * - pk: "user#123"
 * - sk: "profile#456"
 *
 * @param rawPath - The raw path from the API Gateway event
 * @returns An object containing the decoded pk and sk values
 * @throws Error if path is invalid or missing required segments
 */
export function extractCompositeKey(rawPath: string | undefined): CompositeKey {
  if (!rawPath) {
    throw new Error('Path is required');
  }

  const pathSegments = rawPath.split('/').filter(Boolean);

  if (pathSegments.length < 2) {
    throw new Error(
      'Invalid path format. Expected at least two path segments for pk and sk',
    );
  }

  const pk = decodeURIComponent(pathSegments[pathSegments.length - 2]).trim();
  const sk = decodeURIComponent(pathSegments[pathSegments.length - 1]).trim();

  if (!pk || !sk) {
    throw new Error('Both partition key (pk) and sort key (sk) are required');
  }

  return { pk, sk };
}
