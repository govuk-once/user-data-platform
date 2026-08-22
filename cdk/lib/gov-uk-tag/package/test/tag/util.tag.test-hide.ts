import { describe, it, expect } from 'vitest';
import { Template, Match } from 'aws-cdk-lib/assertions';

import { GovUKTag } from '../../../gov-uk-tag.class';
import { RETAIN_TAG, RETAIN_CONTROL_VALUES } from '../../src/tag/util.tag';
import { createTestStack, createLambda } from '../helpers/cdk.helpers';

describe('UtilTag', () => {
  it('exports the correct tag key', () => {
    expect(RETAIN_TAG).toBe('retain');
  });

  describe('RETAIN', () => {
    it('applies retain: true tag', () => {
      const stack = createTestStack();
      const fn = createLambda(stack);

      GovUKTag.of(fn).Util.RETAIN();

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'retain', Value: 'true' }),
        ]),
      });
    });
  });

  it('returns parent GovUKTag for chaining', () => {
    const stack = createTestStack();
    const fn = createLambda(stack);

    const tag = GovUKTag.of(fn);
    const result = tag.Util.RETAIN();
    expect(result).toBe(tag);
  });

  it('has expected control value', () => {
    expect(RETAIN_CONTROL_VALUES.TRUE).toBe('true');
  });
});
