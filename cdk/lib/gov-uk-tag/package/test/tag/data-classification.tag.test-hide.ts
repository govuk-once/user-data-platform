import { describe, it, expect } from 'vitest';
import { Template, Match } from 'aws-cdk-lib/assertions';

import { GovUKTag } from '../../../gov-uk-tag.class';
import {
  DATA_CLASSIFICATION_TAG,
  DATA_CLASSIFICATION_CONTROL_VALUES,
} from '../../src/tag/data-classification.tag';
import { createTestStack, createLambda } from '../helpers/cdk.helpers';

describe('DataClassificationTag', () => {
  it('exports the correct tag key', () => {
    expect(DATA_CLASSIFICATION_TAG).toBe('DataClassification');
  });

  describe('OFFICIAL', () => {
    it('applies DataClassification: OFFICIAL tag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      GovUKTag.of(fn).DataClassification.OFFICIAL();

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'DataClassification', Value: 'OFFICIAL' }),
        ]),
      });
    });
  });

  describe('OFFICIAL_SENSITIVE', () => {
    it('applies DataClassification: OFFICIAL_SENSITIVE tag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      GovUKTag.of(fn).DataClassification.OFFICIAL_SENSITIVE();

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'DataClassification',
            Value: 'OFFICIAL_SENSITIVE',
          }),
        ]),
      });
    });
  });

  describe('SENSITIVE', () => {
    it('applies DataClassification: SENSITIVE tag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      GovUKTag.of(fn).DataClassification.SENSITIVE();

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'DataClassification', Value: 'SENSITIVE' }),
        ]),
      });
    });
  });

  describe('TOP_SECRET', () => {
    it('applies DataClassification: TOP_SECRET tag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      GovUKTag.of(fn).DataClassification.TOP_SECRET();

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'DataClassification', Value: 'TOP_SECRET' }),
        ]),
      });
    });
  });

  it('returns parent GovUKTag for chaining', () => {
    const stack = createTestStack();
    const fn = createLambda(stack);

    const tag = GovUKTag.of(fn);
    const result = tag.DataClassification.OFFICIAL();
    expect(result).toBe(tag);
  });

  it('has all expected control values', () => {
    expect(DATA_CLASSIFICATION_CONTROL_VALUES.OFFICIAL).toBe('OFFICIAL');
    expect(DATA_CLASSIFICATION_CONTROL_VALUES.OFFICIAL_SENSITIVE).toBe(
      'OFFICIAL_SENSITIVE',
    );
    expect(DATA_CLASSIFICATION_CONTROL_VALUES.SENSITIVE).toBe('SENSITIVE');
    expect(DATA_CLASSIFICATION_CONTROL_VALUES.TOP_SECRET).toBe('TOP_SECRET');
  });
});
