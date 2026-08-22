import { describe, it, expect } from 'vitest';
import { Aspects, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { Construct } from 'constructs';

import { GovUKTag } from '../../gov-uk-tag.class';
import { DataClassificationTag } from '../../tag/data-classification.tag';
import { ExposureTag } from '../../tag/exposure.tag';
import { PIITag } from '../../tag/pii.tag';
import { UtilTag } from '../../tag/util.tag';
import {
  createTestApp,
  createTestStack,
  createLambda,
  VALID_PROPS,
} from './helpers/cdk.helpers';

describe('GovUKTag', () => {
  describe('of', () => {
    it('returns a GovUKTag instance', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      const tag = GovUKTag.of(fn);
      expect(tag).toBeInstanceOf(GovUKTag);
    });
  });

  describe('fluent getters', () => {
    it('DataClassification returns DataClassificationTag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);
      expect(GovUKTag.of(fn).DataClassification).toBeInstanceOf(
        DataClassificationTag,
      );
    });

    it('Exposure returns ExposureTag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);
      expect(GovUKTag.of(fn).Exposure).toBeInstanceOf(ExposureTag);
    });

    it('PII returns PIITag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);
      expect(GovUKTag.of(fn).PII).toBeInstanceOf(PIITag);
    });

    it('Util returns UtilTag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);
      expect(GovUKTag.of(fn).Util).toBeInstanceOf(UtilTag);
    });
  });

  describe('add', () => {
    it('applies a tag to the scope', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      GovUKTag.of(fn).add('CustomTag', 'custom-value');

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'CustomTag', Value: 'custom-value' }),
        ]),
      });
    });

    it('returns this for chaining', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      const tag = GovUKTag.of(fn);
      const result = tag.add('Key1', 'val1');
      expect(result).toBe(tag);
    });

    it('supports multiple chained adds', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      GovUKTag.of(fn).add('A', '1').add('B', '2');

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'A', Value: '1' }),
          Match.objectLike({ Key: 'B', Value: '2' }),
        ]),
      });
    });
  });

  describe('applyAspect', () => {
    it('registers aspects on the scope', () => {
      const app = createTestApp();
      GovUKTag.applyAspect(app, VALID_PROPS);

      const aspects = Aspects.of(app).all;
      expect(aspects.length).toBe(2);
    });

    it('does not register aspects when disabled', () => {
      const app = createTestApp();
      GovUKTag.applyAspect(app, { ...VALID_PROPS, disabled: true });

      const aspects = Aspects.of(app).all;
      expect(aspects.length).toBe(0);
    });
  });

  describe('buriedOf', () => {
    it('finds a construct by path suffix', () => {
      const stack = createTestStack();
      createLambda(stack, 'MyLambda');

      const result = GovUKTag.buriedOf(stack, 'MyLambda');
      expect(result).toBeInstanceOf(GovUKTag);
    });

    it('throws when no construct matches', () => {
      const stack = createTestStack();

      expect(() => GovUKTag.buriedOf(stack, 'NonExistent')).toThrow(
        "No construct in stack 'TestStack' matches 'NonExistent'",
      );
    });

    it('throws when path is ambiguous', () => {
      const stack = createTestStack();
      new Construct(stack, 'GroupA');
      createLambda(stack.node.findChild('GroupA') as Stack, 'Handler');
      new Construct(stack, 'GroupB');
      createLambda(stack.node.findChild('GroupB') as Stack, 'Handler');

      expect(() => GovUKTag.buriedOf(stack, 'Handler')).toThrow(
        'Ambiguous path',
      );
    });
  });

  describe('Once', () => {
    it('returns an OnceTag instance with mapEnvironment', () => {
      expect(GovUKTag.Once.mapEnvironment).toBeDefined();
    });

    it('returns an OnceTag instance with Suggested', () => {
      expect(GovUKTag.Once.Suggested).toBeDefined();
    });
  });
});
