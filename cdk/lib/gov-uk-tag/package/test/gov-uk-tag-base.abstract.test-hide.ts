import { describe, it, expect } from 'vitest';
import { CfnResource } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';

import { GovUKTagApplyAspect } from '../../gov-uk-tag-apply.aspect';
import { GovUKTagAspectBase } from '../../gov-uk-tag-base.abstract';
import {
  createTestStack,
  VALID_PROPS,
  VALID_MANDATORY_TAGS,
} from './helpers/cdk.helpers';

import type { GovUKTagAspectProps } from '../../gov-uk-tag.types';

// Use GovUKTagApplyAspect as the concrete subclass for testing the base
function createAspect(props: GovUKTagAspectProps) {
  return new GovUKTagApplyAspect(props);
}

describe('GovUKTagAspectBase', () => {
  describe('validateTagValue', () => {
    it('rejects empty string', () => {
      expect(() =>
        createAspect({
          mandatoryAppTags: { ...VALID_MANDATORY_TAGS, Product: '' },
        }),
      ).toThrow("Tag 'Product' is empty");
    });

    it('rejects whitespace-only string', () => {
      expect(() =>
        createAspect({
          mandatoryAppTags: { ...VALID_MANDATORY_TAGS, Product: '   ' },
        }),
      ).toThrow("Tag 'Product' is empty");
    });

    it('rejects leading whitespace', () => {
      expect(() =>
        createAspect({
          mandatoryAppTags: { ...VALID_MANDATORY_TAGS, Product: ' product' },
        }),
      ).toThrow('leading or trailing whitespace');
    });

    it('rejects trailing whitespace', () => {
      expect(() =>
        createAspect({
          mandatoryAppTags: { ...VALID_MANDATORY_TAGS, Product: 'product ' },
        }),
      ).toThrow('leading or trailing whitespace');
    });

    it('rejects values shorter than MIN_TAG_VALUE_LENGTH', () => {
      expect(() =>
        createAspect({
          mandatoryAppTags: { ...VALID_MANDATORY_TAGS, Product: 'x' },
        }),
      ).toThrow('too short to be meaningful');
    });

    it('accepts values at exactly MIN_TAG_VALUE_LENGTH', () => {
      expect(() =>
        createAspect({
          mandatoryAppTags: { ...VALID_MANDATORY_TAGS, Product: 'ab' },
        }),
      ).not.toThrow();
    });

    it('rejects deny-listed values', () => {
      expect(() =>
        createAspect({
          mandatoryAppTags: { ...VALID_MANDATORY_TAGS, Product: 'todo' },
        }),
      ).toThrow('placeholder value');
    });

    it('rejects deny-listed values case-insensitively', () => {
      expect(() =>
        createAspect({
          mandatoryAppTags: { ...VALID_MANDATORY_TAGS, Product: 'TODO' },
        }),
      ).toThrow('placeholder value');
    });

    it('rejects deny-listed values with underscore separators', () => {
      expect(() =>
        createAspect({
          mandatoryAppTags: { ...VALID_MANDATORY_TAGS, Owner: 'your_team' },
        }),
      ).toThrow('placeholder value');
    });

    it('rejects non-string values at runtime', () => {
      expect(() =>
        createAspect({
          mandatoryAppTags: {
            ...VALID_MANDATORY_TAGS,
            Product: 123 as unknown as string,
          },
        }),
      ).toThrow('must be a string');
    });

    it('accepts valid values', () => {
      expect(() => createAspect(VALID_PROPS)).not.toThrow();
    });
  });

  describe('validateMandatoryAppTags', () => {
    it('passes with all valid tags', () => {
      expect(() => createAspect(VALID_PROPS)).not.toThrow();
    });

    it('throws when a mandatory tag is missing', () => {
      const { ...rest } = VALID_MANDATORY_TAGS;
      expect(() =>
        createAspect({
          mandatoryAppTags: rest as unknown as typeof VALID_MANDATORY_TAGS,
        }),
      ).toThrow("Mandatory tag 'Product' is missing");
    });
  });

  describe('validateOptionalAppTags', () => {
    it('passes with no optional tags', () => {
      expect(() => createAspect(VALID_PROPS)).not.toThrow();
    });

    it('passes with a valid RepositoryUrl', () => {
      expect(() =>
        createAspect({
          ...VALID_PROPS,
          optionalAppTags: {
            RepositoryUrl: 'https://github.com/govuk-once/flex',
          },
        }),
      ).not.toThrow();
    });

    it('rejects an invalid RepositoryUrl', () => {
      expect(() =>
        createAspect({
          ...VALID_PROPS,
          optionalAppTags: { RepositoryUrl: 'https://gitlab.com/org/repo' },
        }),
      ).toThrow('not a GitHub repository URL');
    });

    it('rejects RepositoryUrl with trailing segments', () => {
      expect(() =>
        createAspect({
          ...VALID_PROPS,
          optionalAppTags: {
            RepositoryUrl: 'https://github.com/org/repo/tree/main',
          },
        }),
      ).toThrow('not a GitHub repository URL');
    });

    it('allows undefined optional tags', () => {
      expect(() =>
        createAspect({
          ...VALID_PROPS,
          optionalAppTags: {
            RepositoryUrl: undefined,
            BillingProject: undefined,
          },
        }),
      ).not.toThrow();
    });

    it('rejects placeholder optional tag values', () => {
      expect(() =>
        createAspect({
          ...VALID_PROPS,
          optionalAppTags: { BillingProject: 'n/a' },
        }),
      ).toThrow('placeholder value');
    });
  });

  describe('disabled mode', () => {
    it('skips validation when disabled', () => {
      expect(() =>
        createAspect({
          mandatoryAppTags: { ...VALID_MANDATORY_TAGS, Product: '' },
          disabled: true,
        }),
      ).not.toThrow();
    });
  });

  describe('cfnTypeToResource', () => {
    it('maps AWS::Lambda::Function correctly', () => {
      const result = (
        GovUKTagAspectBase as unknown as {
          cfnTypeToResource: Map<string, string>;
        }
      ).cfnTypeToResource;
      expect(result.get('AWS::Lambda::Function')).toBe('LambdaFunction');
    });

    it('maps AWS::S3::Bucket correctly', () => {
      const result = (
        GovUKTagAspectBase as unknown as {
          cfnTypeToResource: Map<string, string>;
        }
      ).cfnTypeToResource;
      expect(result.get('AWS::S3::Bucket')).toBe('S3Bucket');
    });

    it('returns undefined for unknown CFN types', () => {
      const result = (
        GovUKTagAspectBase as unknown as {
          cfnTypeToResource: Map<string, string>;
        }
      ).cfnTypeToResource;
      expect(result.get('AWS::Foo::Bar')).toBeUndefined();
    });
  });

  describe('tagManagerOf', () => {
    it('returns tag manager for a taggable resource', () => {
      const stack = createTestStack();
      const fn = new lambda.Function(stack, 'Fn', {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = () => {}'),
      });

      const cfnFn = fn.node.defaultChild as CfnResource;
      const tagManager = (
        GovUKTagAspectBase as unknown as {
          tagManagerOf: (node: CfnResource) => unknown;
        }
      ).tagManagerOf(cfnFn);
      expect(tagManager).toBeDefined();
    });
  });

  describe('sourceLocation', () => {
    it('returns undefined when no trace metadata exists', () => {
      const stack = createTestStack();
      const fn = new lambda.Function(stack, 'Fn', {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = () => {}'),
      });

      const result = GovUKTagAspectBase.sourceLocation(fn);
      expect(result).toBeUndefined();
    });
  });
});
