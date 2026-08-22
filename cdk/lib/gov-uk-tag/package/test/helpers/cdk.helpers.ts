import { App, Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { expect } from 'vitest';

import { GovUKEnvironments } from '../../../gov-uk-tag.const';
import { GovUKTag } from '../../../gov-uk-tag.class';

import type { StackProps } from 'aws-cdk-lib';
import type {
  GovUKTagAspectProps,
  GovUKMandatoryAppTags,
  GovUKOptionalAppTags,
} from '../../../gov-uk-tag.types';

export const FAKE_ENV = { account: '123456789012', region: 'eu-west-2' };

export const VALID_MANDATORY_TAGS: GovUKMandatoryAppTags = {
  Product: 'test-product',
  Service: 'test-service',
  Component: 'test-component',
  Environment: GovUKEnvironments.DEVELOPMENT,
  Owner: 'platform-team',
  Source: 'test-repo',
};

export const VALID_OPTIONAL_TAGS: GovUKOptionalAppTags = {
  RepositoryUrl: 'https://github.com/govuk-once/test-repo',
  BillingProject: 'test-billing',
};

export const VALID_PROPS: GovUKTagAspectProps = {
  mandatoryAppTags: VALID_MANDATORY_TAGS,
};

export const VALID_PROPS_WITH_OPTIONAL: GovUKTagAspectProps = {
  mandatoryAppTags: VALID_MANDATORY_TAGS,
  optionalAppTags: VALID_OPTIONAL_TAGS,
};

export function createTestApp(): App {
  return new App();
}

export function createTestStack(app?: App, props?: StackProps): Stack {
  const a = app ?? createTestApp();
  return new Stack(a, 'TestStack', { env: FAKE_ENV, ...props });
}

export function createLambda(stack: Stack, id = 'Fn'): lambda.Function {
  return new lambda.Function(stack, id, {
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: 'index.handler',
    code: lambda.Code.fromInline('exports.handler = () => {}'),
  });
}

export function createBucket(stack: Stack, id = 'Bucket'): s3.Bucket {
  return new s3.Bucket(stack, id);
}

export function createTable(stack: Stack, id = 'Table'): dynamodb.Table {
  return new dynamodb.Table(stack, id, {
    partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
  });
}

export function createQueue(stack: Stack, id = 'Queue'): sqs.Queue {
  return new sqs.Queue(stack, id);
}

/**
 * Synth the app and assert no annotation errors exist on the stack.
 * Useful as a one-liner for compliance-passing tests.
 */
export function synthAndAssertNoErrors(app: App, stack: Stack): void {
  app.synth();
  const annotations = Annotations.fromStack(stack);
  expect(annotations.findError('*', Match.anyValue())).toHaveLength(0);
}

/**
 * Synth the app and assert that at least one annotation error matching
 * the given pattern exists on the stack.
 */
export function synthAndAssertHasError(
  app: App,
  stack: Stack,
  pattern: string,
): void {
  app.synth();
  const annotations = Annotations.fromStack(stack);
  annotations.hasError('*', Match.stringLikeRegexp(pattern));
}

/**
 * Apply the GOV.UK aspect, synth, and assert no errors.
 * Convenience for full compliance tests.
 */
export function applyAndAssertClean(
  app: App,
  stack: Stack,
  props: GovUKTagAspectProps = VALID_PROPS,
): void {
  GovUKTag.applyAspect(app, props);
  synthAndAssertNoErrors(app, stack);
}
