import { describe, it, expect } from 'vitest';
import { CfnResource, TagManager } from 'aws-cdk-lib';

import { GovUKTagApplyAspect } from '../../gov-uk-tag-apply.aspect';
import {
  createTestStack,
  createLambda,
  createBucket,
  VALID_PROPS,
  VALID_PROPS_WITH_OPTIONAL,
} from './helpers/cdk.helpers';

function getTagValues(resource: CfnResource): Record<string, string> {
  if (TagManager.isTaggable(resource)) return resource.tags.tagValues();
  throw new Error('Resource is not taggable');
}

describe('GovUKTagApplyAspect', () => {
  describe('visit', () => {
    it('applies all 6 mandatory tags to a Lambda function', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);
      const cfnFn = fn.node.defaultChild as CfnResource;

      const aspect = new GovUKTagApplyAspect(VALID_PROPS);
      aspect.visit(cfnFn);

      const tags = getTagValues(cfnFn);
      expect(tags['Product']).toBe('test-product');
      expect(tags['Service']).toBe('test-service');
      expect(tags['Component']).toBe('test-component');
      expect(tags['Environment']).toBe('development');
      expect(tags['Owner']).toBe('platform-team');
      expect(tags['Source']).toBe('test-repo');
    });

    it('applies optional tags when provided', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);
      const cfnFn = fn.node.defaultChild as CfnResource;

      const aspect = new GovUKTagApplyAspect(VALID_PROPS_WITH_OPTIONAL);
      aspect.visit(cfnFn);

      const tags = getTagValues(cfnFn);
      expect(tags['RepositoryUrl']).toBe(
        'https://github.com/govuk-once/test-repo',
      );
      expect(tags['BillingProject']).toBe('test-billing');
    });

    it('skips optional tags that are undefined', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);
      const cfnFn = fn.node.defaultChild as CfnResource;

      const aspect = new GovUKTagApplyAspect({
        ...VALID_PROPS,
        optionalAppTags: {
          RepositoryUrl: undefined,
          BillingProject: 'test-billing',
        },
      });
      aspect.visit(cfnFn);

      const tags = getTagValues(cfnFn);
      expect(tags['RepositoryUrl']).toBeUndefined();
      expect(tags['BillingProject']).toBe('test-billing');
    });

    it('is a no-op when disabled', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);
      const cfnFn = fn.node.defaultChild as CfnResource;

      const aspect = new GovUKTagApplyAspect({
        ...VALID_PROPS,
        disabled: true,
      });
      aspect.visit(cfnFn);

      const tags = getTagValues(cfnFn);
      expect(tags['Product']).toBeUndefined();
    });

    it('skips non-CfnResource nodes', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      const aspect = new GovUKTagApplyAspect(VALID_PROPS);
      expect(() => aspect.visit(fn)).not.toThrow();
    });

    it('applies tags to multiple resource types', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);
      const bucket = createBucket(stack);
      const cfnFn = fn.node.defaultChild as CfnResource;
      const cfnBucket = bucket.node.defaultChild as CfnResource;

      const aspect = new GovUKTagApplyAspect(VALID_PROPS);
      aspect.visit(cfnFn);
      aspect.visit(cfnBucket);

      expect(getTagValues(cfnFn)['Product']).toBe('test-product');
      expect(getTagValues(cfnBucket)['Product']).toBe('test-product');
    });
  });
});
