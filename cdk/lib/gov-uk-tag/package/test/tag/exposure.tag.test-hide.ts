import { describe, it, expect } from 'vitest';
import { Template, Match } from 'aws-cdk-lib/assertions';

import { GovUKTag } from '../../../gov-uk-tag.class';
import {
  EXPOSURE_TAG,
  EXPOSURE_CONTROL_VALUES,
} from '../../src/tag/exposure.tag';
import { createTestStack, createLambda } from '../helpers/cdk.helpers';

describe('ExposureTag', () => {
  it('exports the correct tag key', () => {
    expect(EXPOSURE_TAG).toBe('Exposure');
  });

  describe('INTERNAL', () => {
    it('applies Exposure: internal tag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      GovUKTag.of(fn).Exposure.INTERNAL();

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Exposure', Value: 'internal' }),
        ]),
      });
    });
  });

  describe('INTERNET_FACING', () => {
    it('applies Exposure: internet_facing tag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      GovUKTag.of(fn).Exposure.INTERNET_FACING();

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Exposure', Value: 'internet_facing' }),
        ]),
      });
    });
  });

  describe('PERIMETER', () => {
    it('applies Exposure: perimeter tag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      GovUKTag.of(fn).Exposure.PERIMETER();

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Exposure', Value: 'perimeter' }),
        ]),
      });
    });
  });

  describe('ISOLATED', () => {
    it('applies Exposure: isolated tag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      GovUKTag.of(fn).Exposure.ISOLATED();

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Exposure', Value: 'isolated' }),
        ]),
      });
    });
  });

  it('returns parent GovUKTag for chaining', () => {
    const stack = createTestStack();
    const fn = createLambda(stack);

    const tag = GovUKTag.of(fn);
    const result = tag.Exposure.INTERNAL();
    expect(result).toBe(tag);
  });

  it('has all expected control values', () => {
    expect(EXPOSURE_CONTROL_VALUES.INTERNAL).toBe('internal');
    expect(EXPOSURE_CONTROL_VALUES.INTERNET_FACING).toBe('internet_facing');
    expect(EXPOSURE_CONTROL_VALUES.PERIMETER).toBe('perimeter');
    expect(EXPOSURE_CONTROL_VALUES.ISOLATED).toBe('isolated');
  });
});
