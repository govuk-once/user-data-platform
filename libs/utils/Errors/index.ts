export enum UDP_ERROR_TYPES {
  BAD_REQUEST = 'BAD_REQUEST',
  IDENTITY_NOT_FOUND = 'IDENTITY_NOT_FOUND',
  DATA_NOT_FOUND = 'DATA_NOT_FOUND',
  SAR_NOT_FOUND = 'SAR_NOT_FOUND',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

export class BaseUDPError extends Error {
  public errorType: UDP_ERROR_TYPES;

  constructor(message: string, errorType: UDP_ERROR_TYPES) {
    super(message);
    this.errorType = errorType;
    this.name = 'BaseUDPError';
  }
}

export class MissingEnvironmentVariablesError extends BaseUDPError {
  public envVars: string[];

  constructor(
    message: string,
    errorType: UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
    envVars: string[],
  ) {
    super(message, errorType);
    this.errorType = errorType;
    this.envVars = envVars;
    this.name = 'MissingEnvironmentVariablesError';
  }
}

export class IdentityLinkingInvalidIdentitesError extends BaseUDPError {
  public appId: string;
  public serviceId: string;

  constructor(
    message: string,
    errorType: UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
    appId: string,
    serviceId: string,
  ) {
    super(message, errorType);
    this.errorType = errorType;
    this.appId = appId;
    this.serviceId = serviceId;
    this.name = 'IdentityLinkingInvalidIdentitesError';
  }
}

export class ZodValidationError extends BaseUDPError {
  public errorPaths: string[];

  constructor(
    message: string,
    errorType: UDP_ERROR_TYPES.BAD_REQUEST,
    errorPaths: string[],
  ) {
    super(message, errorType);
    this.errorType = errorType;
    this.errorPaths = errorPaths;
    this.name = 'ZodValidationError';
  }
}

export class InvalidDynamoKeyError extends BaseUDPError {
  public pk: string;
  public sk?: string;

  constructor(
    message: string,
    errorType: UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
    pk: string,
    sk?: string,
  ) {
    super(message, errorType);
    this.errorType = errorType;
    this.pk = pk;
    this.sk = sk;
    this.name = 'InvalidDynamoKeyError';
  }
}

export class EncryptionError extends BaseUDPError {
  public kmsKeyId: string;

  constructor(
    message: string,
    errorType: UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
    kmsKeyId: string,
  ) {
    super(message, errorType);
    this.kmsKeyId = kmsKeyId;
    this.name = 'EncryptionError';
  }
}

export class IdentityRecordNotFoundError extends BaseUDPError {
  public serviceName: string;
  public serviceUserId: string;

  constructor(
    message: string,
    errorType: UDP_ERROR_TYPES.IDENTITY_NOT_FOUND,
    serviceName: string,
    serviceUserId: string,
  ) {
    super(message, errorType);
    this.name = 'IdentityNotFoundError';
    this.serviceName = serviceName;
    this.serviceUserId = serviceUserId;
  }
}

export class DataRecordNotFoundError extends BaseUDPError {
  public serviceName: string;
  public serviceUserId: string;
  public resourcePath: string;

  constructor(
    message: string,
    errorType: UDP_ERROR_TYPES.DATA_NOT_FOUND,
    serviceName: string,
    serviceUserId: string,
    resourcePath: string,
  ) {
    super(message, errorType);
    this.name = 'DataNotFoundError';
    this.serviceName = serviceName;
    this.serviceUserId = serviceUserId;
    this.resourcePath = resourcePath;
  }
}

export class SarNotFoundError extends BaseUDPError {
  public sarId?: string;

  constructor(
    message: string,
    sarId?: string,
  ) {
    super(message, UDP_ERROR_TYPES.SAR_NOT_FOUND);
    this.name = 'SarNotFoundError';
    this.sarId = sarId;
  }
}
