import { JSON_SCHEMA_DIALECT, type JsonSchema } from './shape';

/**
 * A live schema serialised as a W3C DCAT 3 `dcat:Distribution` in JSON-LD 1.1.
 *
 * The udpKey is the `dcat:Dataset`; each schema version is one of its
 * distributions. Standard DCAT / Dublin Core terms carry the catalogue
 * metadata, so a future catalogue can ingest rows without transformation.
 * `schemaDefinition` has no DCAT equivalent, so it is declared as a JSON
 * literal (`@type: @json`): RDF tooling keeps it intact as one value instead
 * of dropping it, and SQL can still reach it at `dcatSchema->'schemaDefinition'`.
 */
export interface DcatDistribution {
  '@context': typeof DCAT_CONTEXT;
  '@type': 'dcat:Distribution';
  'dct:identifier': string;
  'dct:issued': string;
  'dcat:mediaType': { '@id': string };
  'dct:conformsTo': { '@id': string };
  schemaDefinition: JsonSchema & { $schema: string };
}

export const DCAT_CONTEXT = {
  dcat: 'http://www.w3.org/ns/dcat#',
  dct: 'http://purl.org/dc/terms/',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  'dct:issued': { '@type': 'xsd:dateTime' },
  schemaDefinition: {
    '@id': 'urn:udp:live-schema#schemaDefinition',
    '@type': '@json',
  },
} as const;

const JSON_MEDIA_TYPE =
  'https://www.iana.org/assignments/media-types/application/json';

export const toDcatDistribution = (
  udpKey: string,
  version: string,
  dateSaved: Date,
  schema: JsonSchema,
): DcatDistribution => ({
  '@context': DCAT_CONTEXT,
  '@type': 'dcat:Distribution',
  'dct:identifier': `${udpKey}@${version}`,
  'dct:issued': dateSaved.toISOString(),
  'dcat:mediaType': { '@id': JSON_MEDIA_TYPE },
  'dct:conformsTo': { '@id': JSON_SCHEMA_DIALECT },
  schemaDefinition: { $schema: JSON_SCHEMA_DIALECT, ...schema },
});

/** Extracts the bare shape from a stored distribution, for comparison. */
export const fromDcatDistribution = (
  distribution: DcatDistribution,
): JsonSchema => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, ...schema } = distribution.schemaDefinition;
  return schema;
};
