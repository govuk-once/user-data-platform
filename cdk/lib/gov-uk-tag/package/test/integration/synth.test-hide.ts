import { describe, it, expect } from 'vitest';
import { Template, Match, Annotations } from 'aws-cdk-lib/assertions';

import { GovUKTag } from '../../../gov-uk-tag.class';
import {
  createTestApp,
  createTestStack,
  createLambda,
  createBucket,
  VALID_PROPS,
  VALID_PROPS_WITH_OPTIONAL,
  synthAndAssertNoErrors,
  synthAndAssertHasError,
} from '../helpers/cdk.helpers';

describe('CDK synth integration', () => {
  describe('compliant stack', () => {
    it('synthesises without errors when all compliance tags are present', () => {
      const app = createTestApp();
      const stack = createTestStack(app);

      const fn = createLambda(stack);
      GovUKTag.of(fn).PII.TRUE();
      GovUKTag.of(fn).DataClassification.OFFICIAL();
      GovUKTag.of(fn).Exposure.INTERNAL();

      const bucket = createBucket(stack);
      GovUKTag.of(bucket).PII.FALSE();
      GovUKTag.of(bucket).DataClassification.OFFICIAL();
      GovUKTag.of(bucket).Exposure.INTERNAL();

      GovUKTag.applyAspect(app, VALID_PROPS);
      synthAndAssertNoErrors(app, stack);
    });
  });

  describe('mandatory app tags', () => {
    it('appear on all resources after synth', () => {
      const app = createTestApp();
      const stack = createTestStack(app);

      const fn = createLambda(stack);
      GovUKTag.of(fn).PII.TRUE();
      GovUKTag.of(fn).DataClassification.OFFICIAL();
      GovUKTag.of(fn).Exposure.INTERNAL();

      const bucket = createBucket(stack);
      GovUKTag.of(bucket).PII.FALSE();
      GovUKTag.of(bucket).DataClassification.OFFICIAL();
      GovUKTag.of(bucket).Exposure.INTERNAL();

      GovUKTag.applyAspect(app, VALID_PROPS);
      app.synth();

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Component', Value: 'test-component' }),
          Match.objectLike({ Key: 'Environment', Value: 'development' }),
          Match.objectLike({ Key: 'Owner', Value: 'platform-team' }),
          Match.objectLike({ Key: 'Product', Value: 'test-product' }),
          Match.objectLike({ Key: 'Service', Value: 'test-service' }),
          Match.objectLike({ Key: 'Source', Value: 'test-repo' }),
        ]),
      });

      template.hasResourceProperties('AWS::S3::Bucket', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Owner', Value: 'platform-team' }),
          Match.objectLike({ Key: 'Product', Value: 'test-product' }),
        ]),
      });
    });
  });

  describe('compliance tags', () => {
    it('appear on tagged resources', () => {
      const app = createTestApp();
      const stack = createTestStack(app);

      const fn = createLambda(stack);
      GovUKTag.of(fn).PII.TRUE();
      GovUKTag.of(fn).DataClassification.OFFICIAL_SENSITIVE();
      GovUKTag.of(fn).Exposure.INTERNET_FACING();

      GovUKTag.applyAspect(app, VALID_PROPS);
      app.synth();

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'DataClassification',
            Value: 'OFFICIAL_SENSITIVE',
          }),
          Match.objectLike({ Key: 'Exposure', Value: 'internet_facing' }),
          Match.objectLike({ Key: 'PII', Value: 'true' }),
        ]),
      });
    });
  });

  describe('missing compliance tags', () => {
    it('produce annotation errors', () => {
      const app = createTestApp();
      const stack = createTestStack(app);
      createLambda(stack);

      GovUKTag.applyAspect(app, VALID_PROPS);
      synthAndAssertHasError(app, stack, 'Missing required tags');
    });
  });

  describe('optional tags', () => {
    it('appear in template when provided', () => {
      const app = createTestApp();
      const stack = createTestStack(app);

      const fn = createLambda(stack);
      GovUKTag.of(fn).PII.TRUE();
      GovUKTag.of(fn).DataClassification.OFFICIAL();
      GovUKTag.of(fn).Exposure.INTERNAL();

      GovUKTag.applyAspect(app, VALID_PROPS_WITH_OPTIONAL);
      app.synth();

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'BillingProject', Value: 'test-billing' }),
          Match.objectLike({
            Key: 'RepositoryUrl',
            Value: 'https://github.com/govuk-once/test-repo',
          }),
        ]),
      });
    });

    it('are not present when not provided', () => {
      const app = createTestApp();
      const stack = createTestStack(app);

      const fn = createLambda(stack);
      GovUKTag.of(fn).PII.TRUE();
      GovUKTag.of(fn).DataClassification.OFFICIAL();
      GovUKTag.of(fn).Exposure.INTERNAL();

      GovUKTag.applyAspect(app, VALID_PROPS);
      app.synth();

      const template = Template.fromStack(stack);
      const resources = template.findResources('AWS::Lambda::Function');
      const resourceKey = Object.keys(resources)[0];
      const tags = resources[resourceKey].Properties.Tags as {
        Key: string;
        Value: string;
      }[];
      const tagKeys = tags.map((t) => t.Key);

      expect(tagKeys).not.toContain('RepositoryUrl');
      expect(tagKeys).not.toContain('BillingProject');
    });
  });

  describe('disabled mode', () => {
    it('produces no tags or errors', () => {
      const app = createTestApp();
      const stack = createTestStack(app);
      createLambda(stack);

      GovUKTag.applyAspect(app, { ...VALID_PROPS, disabled: true });
      app.synth();

      const annotations = Annotations.fromStack(stack);
      expect(annotations.findError('*', Match.anyValue())).toHaveLength(0);

      const template = Template.fromStack(stack);
      const fnResource = template.findResources('AWS::Lambda::Function');
      const resourceKey = Object.keys(fnResource)[0];
      const tags = fnResource[resourceKey].Properties?.Tags;
      expect(tags).toBeUndefined();
    });
  });

  describe('full fluent chain', () => {
    it('supports chaining all compliance tags on one resource', () => {
      const app = createTestApp();
      const stack = createTestStack(app);

      const fn = createLambda(stack);
      GovUKTag.of(fn)
        .PII.TRUE()
        .DataClassification.OFFICIAL()
        .Exposure.INTERNAL();

      GovUKTag.applyAspect(app, VALID_PROPS);
      synthAndAssertNoErrors(app, stack);

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'DataClassification', Value: 'OFFICIAL' }),
          Match.objectLike({ Key: 'Exposure', Value: 'internal' }),
          Match.objectLike({ Key: 'PII', Value: 'true' }),
          Match.objectLike({ Key: 'Product', Value: 'test-product' }),
        ]),
      });
    });
  });
});
