/**
 * Base error class for all repository-related errors.
 */
export class RepositoryError extends Error {
  /**
   * Creates a new RepositoryError.
   * @param message - The error message
   */
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

/**
 * Error thrown when an entity is not found in the repository.
 */
export class NotFoundError extends RepositoryError {
  /**
   * Creates a new NotFoundError.
   * @param entityName - The name of the entity type that was not found
   * @param id - The identifier of the entity that was not found
   */
  constructor(entityName: string, id: string) {
    super(`${entityName} with id ${id} not found.`);
    this.name = 'NotFoundError';
  }
}

/**
 * Error thrown when saving an entity to the repository fails.
 */
export class SaveError extends RepositoryError {
  /**
   * The underlying error that caused the save to fail.
   */
  public readonly cause: Error;

  /**
   * Creates a new SaveError.
   * @param entityName - The name of the entity type that failed to save
   * @param id - The identifier of the entity that failed to save
   * @param originalError - The underlying error that caused the save to fail
   */
  constructor(entityName: string, id: string, originalError: Error) {
    super(
      `Failed to save ${entityName} with id ${id}: ${originalError.message}`,
    );
    this.name = 'SaveError';
    this.cause = originalError;
  }
}

/**
 * Error thrown when retrieving an entity from the repository fails.
 */
export class GetError extends RepositoryError {
  /**
   * The underlying error that caused the retrieval to fail.
   */
  public readonly cause: Error;

  /**
   * Creates a new GetError.
   * @param entityName - The name of the entity type that failed to retrieve
   * @param id - The identifier of the entity that failed to retrieve
   * @param originalError - The underlying error that caused the retrieval to fail
   */
  constructor(entityName: string, id: string, originalError: Error) {
    super(
      `Failed to get ${entityName} with id ${id}: ${originalError.message}`,
    );
    this.name = 'GetError';
    this.cause = originalError;
  }
}
