import { describe, it, expect } from 'vitest';
import { Aspects, AspectPriority } from 'aws-cdk-lib';
import { Annotations, Match } from 'aws-cdk-lib/assertions';

import { GovUKTag } from '../../gov-uk-tag.class';
import { GovUKTagValidateAspect } from '../../gov-uk-tag-validate.aspect';
import { GovUKTagApplyAspect } from '../../gov-uk-tag-apply.aspect';
import {
  createTestApp,
  createTestStack,
  createLambda,
  VALID_PROPS,
  synthAndAssertNoErrors,
  synthAndAssertHasError,
} from './helpers/cdk.helpers';

describe('GovUKTagValidateAspect', () => {
  describe('visit', () => {
    it('reports missing compliance tags for Lambda', () => {
      const app = createTestApp();
      const stack = createTestStack(app);
      createLambda(stack);

      Aspects.of(app).add(new GovUKTagApplyAspect(VALID_PROPS), {
        priority: AspectPriority.MUTATING,
      });
      Aspects.of(app).add(new GovUKTagValidateAspect(VALID_PROPS), {
        priority: AspectPriority.READONLY,
      });

      synthAndAssertHasError(app, stack, 'Missing required tags');
    });

    it('no errors when all compliance tags are present', () => {
      const app = createTestApp();
      const stack = createTestStack(app);
      const fn = createLambda(stack);

      GovUKTag.of(fn).PII.TRUE();
      GovUKTag.of(fn).DataClassification.OFFICIAL();
      GovUKTag.of(fn).Exposure.INTERNAL();

      Aspects.of(app).add(new GovUKTagApplyAspect(VALID_PROPS), {
        priority: AspectPriority.MUTATING,
      });
      Aspects.of(app).add(new GovUKTagValidateAspect(VALID_PROPS), {
        priority: AspectPriority.READONLY,
      });

      synthAndAssertNoErrors(app, stack);
    });

    it('reports only missing tags (partial compliance)', () => {
      const app = createTestApp();
      const stack = createTestStack(app);
      const fn = createLambda(stack);

      GovUKTag.of(fn).PII.TRUE();

      Aspects.of(app).add(new GovUKTagApplyAspect(VALID_PROPS), {
        priority: AspectPriority.MUTATING,
      });
      Aspects.of(app).add(new GovUKTagValidateAspect(VALID_PROPS), {
        priority: AspectPriority.READONLY,
      });
      app.synth();

      const annotations = Annotations.fromStack(stack);
      const errors = annotations.findError('*', Match.anyValue());
      expect(errors.length).toBeGreaterThan(0);

      const errorMsg = errors[0].entry.data as string;
      expect(errorMsg).toContain('DataClassification');
      expect(errorMsg).toContain('Exposure');
      expect(errorMsg).not.toContain('PII');
    });

    it('does not report errors for unknown CFN types', () => {
      const app = createTestApp();
      const stack = createTestStack(app);
      const fn = createLambda(stack);

      GovUKTag.of(fn).PII.TRUE();
      GovUKTag.of(fn).DataClassification.OFFICIAL();
      GovUKTag.of(fn).Exposure.INTERNAL();

      Aspects.of(app).add(new GovUKTagApplyAspect(VALID_PROPS), {
        priority: AspectPriority.MUTATING,
      });
      Aspects.of(app).add(new GovUKTagValidateAspect(VALID_PROPS), {
        priority: AspectPriority.READONLY,
      });

      synthAndAssertNoErrors(app, stack);
    });

    it('is a no-op when disabled', () => {
      const app = createTestApp();
      const stack = createTestStack(app);
      createLambda(stack);

      Aspects.of(app).add(
        new GovUKTagValidateAspect({ ...VALID_PROPS, disabled: true }),
        {
          priority: AspectPriority.READONLY,
        },
      );

      synthAndAssertNoErrors(app, stack);
    });

    it('error includes the resource label and CFN type', () => {
      const app = createTestApp();
      const stack = createTestStack(app);
      createLambda(stack);

      Aspects.of(app).add(new GovUKTagApplyAspect(VALID_PROPS), {
        priority: AspectPriority.MUTATING,
      });
      Aspects.of(app).add(new GovUKTagValidateAspect(VALID_PROPS), {
        priority: AspectPriority.READONLY,
      });
      app.synth();

      const annotations = Annotations.fromStack(stack);
      const errors = annotations.findError('*', Match.anyValue());
      const errorMsg = errors[0].entry.data as string;
      expect(errorMsg).toContain('AWS::Lambda::Function');
    });
  });
});
