import type { DsqlConnection } from './dsql';
import {
  fromDcatDistribution,
  toDcatDistribution,
  type DcatDistribution,
} from './dcat';
import { mergeSchemas, schemasEqual, type JsonSchema } from './shape';
import { LIVE_SCHEMAS_TABLE } from './tables';

export const INITIAL_SCHEMA_VERSION = '1.1';

/**
 * Versions step by 0.1 (1.1, 1.2 ... 1.9, 2.0). Arithmetic is done in tenths
 * so floating point never leaks into the key.
 */
export const nextSchemaVersion = (version: string): string =>
  ((Math.round(Number(version) * 10) + 1) / 10).toFixed(1);

/** Racing writers for the same key: re-read and re-merge this many times. */
const MAX_EVOLVE_ATTEMPTS = 3;

export interface EvolveResult {
  version: string;
  created: boolean;
}

/** Reads and versions live schemas in the DSQL `live_schemas` table. */
export class LiveSchemaRepository {
  constructor(
    private readonly db: DsqlConnection,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getLatest(
    udpKey: string,
  ): Promise<{ version: string; schema: JsonSchema } | undefined> {
    const { rows } = await this.db.query<{
      version: string;
      dcatSchema: DcatDistribution | string;
    }>(
      `SELECT version::text AS version, "dcatSchema" FROM ${LIVE_SCHEMAS_TABLE}
       WHERE "udpKey" = $1 ORDER BY version DESC LIMIT 1`,
      [udpKey],
    );
    const [latest] = rows;
    if (!latest) return undefined;

    // jsonb arrives parsed; tolerate a text column too.
    const distribution =
      typeof latest.dcatSchema === 'string'
        ? (JSON.parse(latest.dcatSchema) as DcatDistribution)
        : latest.dcatSchema;
    return {
      version: latest.version,
      schema: fromDcatDistribution(distribution),
    };
  }

  /**
   * Merges `observed` into the latest schema for `udpKey`. A new version is
   * written only when that changes the shape; otherwise the current version
   * is returned. Previous versions are never modified.
   */
  async evolve(udpKey: string, observed: JsonSchema): Promise<EvolveResult> {
    for (let attempt = 1; attempt <= MAX_EVOLVE_ATTEMPTS; attempt++) {
      const latest = await this.getLatest(udpKey);
      const merged = latest ? mergeSchemas(latest.schema, observed) : observed;

      if (latest && schemasEqual(merged, latest.schema)) {
        return { version: latest.version, created: false };
      }

      const version = latest
        ? nextSchemaVersion(latest.version)
        : INITIAL_SCHEMA_VERSION;

      if (await this.insert(udpKey, version, merged)) {
        return { version, created: true };
      }
      // Another invocation wrote this version first; fold ours into theirs.
    }

    throw new Error(
      `Gave up evolving live schema for ${udpKey} after ${MAX_EVOLVE_ATTEMPTS} conflicting writes`,
    );
  }

  private async insert(
    udpKey: string,
    version: string,
    schema: JsonSchema,
  ): Promise<boolean> {
    const dateSaved = this.now();
    const { rowCount } = await this.db.query(
      `INSERT INTO ${LIVE_SCHEMAS_TABLE} ("udpKey", version, "dateSaved", "dcatSchema")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("udpKey", version) DO NOTHING`,
      [
        udpKey,
        version,
        dateSaved,
        JSON.stringify(toDcatDistribution(udpKey, version, dateSaved, schema)),
      ],
    );
    return rowCount === 1;
  }
}
