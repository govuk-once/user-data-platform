/**
 * Structured logger for data access operations.
 * Outputs JSON logs suitable for CloudWatch Logs Insights.
 */
class StructuredLogger {
  private enabled: boolean = true;

  /**
   * Enable or disable logging globally.
   * Useful for testing or disabling logs in certain environments.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if logging is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Logs an informational message.
   * @param message - The log message
   * @param context - Additional context to include in the log
   */
  info(message: string, context?: Record<string, any>): void {
    if (!this.enabled) return;
    
    console.log(JSON.stringify({
      level: 'INFO',
      message,
      timestamp: new Date().toISOString(),
      ...context,
    }));
  }

  /**
   * Logs an error message.
   * @param message - The error message
   * @param context - Additional context to include in the log
   */
  error(message: string, context?: Record<string, any>): void {
    if (!this.enabled) return;
    
    console.error(JSON.stringify({
      level: 'ERROR',
      message,
      timestamp: new Date().toISOString(),
      ...context,
    }));
  }

  /**
   * Logs a debug message.
   * @param message - The debug message
   * @param context - Additional context to include in the log
   */
  debug(message: string, context?: Record<string, any>): void {
    if (!this.enabled) return;
    
    console.debug(JSON.stringify({
      level: 'DEBUG',
      message,
      timestamp: new Date().toISOString(),
      ...context,
    }));
  }
}

/**
 * Singleton logger instance for the data access library.
 * Can be disabled globally via logger.setEnabled(false) for testing.
 */
export const logger = new StructuredLogger();
