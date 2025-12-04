import { Logger as PowerToolLogger } from '@aws-lambda-powertools/logger';
import { search } from '@aws-lambda-powertools/logger/correlationId';
import { Console } from 'console';

export interface LoggerOptions {
  redact?: string[]; // list of fields to redact
}

export interface CommonLogFields {
  serviceName: string;
  environment: string;
  correlationId?: string;
  functionName?: string;
  functionVersion?: string;
  requestId?: string;
}

export class Logger extends PowerToolLogger {
  private redactedFields: string[];
  private commonFields: CommonLogFields;

  constructor(commonFields: CommonLogFields, options?: LoggerOptions) {
    super({
      serviceName: commonFields.serviceName,
      ...options,
    });

    this.commonFields = commonFields;
    this.redactedFields = options?.redact ?? [];
  }
  /** -------- Redaction Utilities -------- */

  private redactObject<T>(input: T): T {
    if (!input || typeof input !== 'object') return input;

    const clone: any = Array.isArray(input) ? [...input] : { ...input };

    for (const key in clone) {
      if (!Object.prototype.hasOwnProperty.call(clone, key)) continue;

      if (this.redactedFields.includes(key)) {
        clone[key] = "***REDACTED***";
      } else if (typeof clone[key] === "object") {
        clone[key] = this.redactObject(clone[key]);
      }
    }

    return clone;
  }

  private wrapFields(fields?: Record<string, unknown>) {
    return fields ? this.redactObject(fields) : fields;
  }

  /** -------- Override Powertools Logging Methods -------- */

  public override info(message: string, fields?: Record<string, unknown>): void {
    super.info(message, this.wrapFields({...fields, ...this.commonFields}));
  }

  public override error(message: string, fields?: Record<string, unknown>): void {
    super.error(message, this.wrapFields({...fields, ...this.commonFields}));
  }

  public override warn(message: string, fields?: Record<string, unknown>): void {
    super.warn(message, this.wrapFields({...fields, ...this.commonFields}));
  }

  public override debug(message: string, fields?: Record<string, unknown>): void {
    super.debug(message, this.wrapFields({...fields, ...this.commonFields}));
  }

  public override trace(message: string, fields?: Record<string, unknown>): void {
    super.trace(message, this.wrapFields({...fields, ...this.commonFields}));
  }
}