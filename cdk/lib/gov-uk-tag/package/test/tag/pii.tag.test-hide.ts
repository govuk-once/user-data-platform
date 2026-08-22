import { describe, it, expect } from 'vitest';
import { Template, Match } from 'aws-cdk-lib/assertions';

import { GovUKTag } from '../../../gov-uk-tag.class';
import { PII_TAG, PII_CONTROL_VALUES } from '../../src/tag/pii.tag';
import { createTestStack, createLambda } from '../helpers/cdk.helpers';

describe('PIITag', () => {
  it('exports the correct tag key', () => {
    expect(PII_TAG).toBe('PII');
  });

  describe('TRUE', () => {
    it('applies PII: true tag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      GovUKTag.of(fn).PII.TRUE();

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'PII', Value: 'true' }),
        ]),
      });
    });
  });

  describe('FALSE', () => {
    it('applies PII: false tag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      GovUKTag.of(fn).PII.FALSE();

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'PII', Value: 'false' }),
        ]),
      });
    });
  });

  describe('UNKNOWN', () => {
    it('applies PII: unknown tag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      GovUKTag.of(fn).PII.UNKNOWN();

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'PII', Value: 'unknown' }),
        ]),
      });
    });
  });

  it('returns parent GovUKTag for chaining', () => {
    const stack = createTestStack();
    const fn = createLambda(stack);

    const tag = GovUKTag.of(fn);
    const result = tag.PII.TRUE();
    expect(result).toBe(tag);
  });

  it('has all expected control values', () => {
    expect(PII_CONTROL_VALUES.TRUE).toBe('true');
    expect(PII_CONTROL_VALUES.FALSE).toBe('false');
    expect(PII_CONTROL_VALUES.UNKNOWN).toBe('unknown');
  });
});
