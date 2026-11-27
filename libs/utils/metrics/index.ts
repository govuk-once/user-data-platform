/**
 * Minimal CloudWatch Embedded Metric Format (EMF) emitter.
 *
 * CloudWatch extracts metrics from any Lambda log line shaped like this, so
 * there is no PutMetricData call, no extra IAM and no added latency. The line
 * is written straight to stdout (not console.*) because the Lambda runtime
 * prefixes console output, which stops CloudWatch recognising it as EMF.
 */

export const UDP_METRIC_NAMESPACE = 'UDP';

export const UdpMetricNames = {
  /** A KMS data-key decrypt or AES-GCM integrity check failed. Feeds alarm C5. */
  DecryptionFailure: 'DecryptionFailure',
} as const;

export type UdpMetricName =
  (typeof UdpMetricNames)[keyof typeof UdpMetricNames];

/**
 * Emits a Count metric dimensioned by `Stack`. Alarms filter on the stack
 * prefix (e.g. `prod`, `alice-dev`) so developer stacks sharing an account
 * don't trip each other's alarms.
 */
export function emitCountMetric(
  metricName: UdpMetricName,
  value = 1,
  properties: Record<string, string> = {},
): void {
  const stack = process.env.STACK ?? 'unknown';
  const line = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: UDP_METRIC_NAMESPACE,
          Dimensions: [['Stack']],
          Metrics: [{ Name: metricName, Unit: 'Count' }],
        },
      ],
    },
    Stack: stack,
    [metricName]: value,
    ...properties,
  };

  process.stdout.write(`${JSON.stringify(line)}\n`);
}
