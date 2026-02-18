export const config = {
  apiBaseUrl: __ENV.API_BASE_URL || '',
  apiKey: __ENV.API_KEY || '',
  awsRegion: __ENV.AWS_REGION || 'eu-west-2',
  consumerRoleArn: __ENV.CONSUMER_ROLE_ARN || '',
};

export const nfr = {
  P95_LATENCY_MS: 200,
  TARGET_RPS: 100,
  MAX_ERROR_RATE: 0.001,
};
