export enum BOOLEAN {
  TRUE = 'true',
  FALSE = 'false',
}

export enum BOOLEAN_UNKNOWN {
  TRUE = BOOLEAN.TRUE,
  FALSE = BOOLEAN.FALSE,
  UNKNOWN = 'unknown',
}

export enum DATA_CLASSIFICATION {
  SENSITIVE = 'SENSITIVE',
  TOP_SECRET = 'TOP_SECRET',
  OFFICIAL = 'OFFICIAL',
  OFFICIAL_SENSITIVE = 'OFFICIAL_SENSITIVE',
}

export enum EXPOSURE {
  INTERNET_FACING = 'internet_facing',
  PERIMETER = 'perimeter',
  INTERNAL = 'internal',
  ISOLATED = 'isolated',
}

export enum PII {
  TRUE = BOOLEAN.TRUE,
  FALSE = BOOLEAN.FALSE,
  UNKNOWN = 'unknown',
}

// export enum PII {
//     ...BOOLEAN_UNKNOWN
// }
