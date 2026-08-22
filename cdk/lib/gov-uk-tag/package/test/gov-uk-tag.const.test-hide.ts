import { describe, it, expect } from 'vitest';

import {
  GovUKEnvironments,
  APP_TAG_PRIORITY,
  MIN_TAG_VALUE_LENGTH,
  INVALID_TAG_VALUES,
  MandatoryAppTag,
  GOV_UK_MANDATORY_APP_TAG_KEYS,
} from '../../gov-uk-tag.const';

describe('GovUKEnvironments', () => {
  it('has exactly 6 members', () => {
    expect(Object.values(GovUKEnvironments)).toHaveLength(6);
  });

  it('contains all expected environments', () => {
    expect(GovUKEnvironments.SANDBOX).toBe('sandbox');
    expect(GovUKEnvironments.BUILD).toBe('build');
    expect(GovUKEnvironments.DEVELOPMENT).toBe('development');
    expect(GovUKEnvironments.INTEGRATION).toBe('integration');
    expect(GovUKEnvironments.STAGING).toBe('staging');
    expect(GovUKEnvironments.PRODUCTION).toBe('production');
  });

  it('all values are lowercase', () => {
    for (const value of Object.values(GovUKEnvironments)) {
      expect(value).toMatch(/^[a-z]+$/);
    }
  });
});

describe('APP_TAG_PRIORITY', () => {
  it('is 50', () => {
    expect(APP_TAG_PRIORITY).toBe(50);
  });
});

describe('MIN_TAG_VALUE_LENGTH', () => {
  it('is 2', () => {
    expect(MIN_TAG_VALUE_LENGTH).toBe(2);
  });
});

describe('INVALID_TAG_VALUES', () => {
  it('is a Set', () => {
    expect(INVALID_TAG_VALUES).toBeInstanceOf(Set);
  });

  it('contains expected placeholder values', () => {
    const expected = [
      'todo',
      'n/a',
      'placeholder',
      'changeme',
      'tbc',
      'tbd',
      'foo',
      'bar',
    ];
    for (const value of expected) {
      expect(INVALID_TAG_VALUES.has(value)).toBe(true);
    }
  });

  it('does not contain legitimate values', () => {
    const legitimate = ['production', 'official', 'lambda', 'my-real-service'];
    for (const value of legitimate) {
      expect(INVALID_TAG_VALUES.has(value)).toBe(false);
    }
  });
});

describe('MandatoryAppTag', () => {
  it('has exactly 6 keys', () => {
    expect(Object.keys(MandatoryAppTag)).toHaveLength(6);
  });

  it('maps to expected tag names', () => {
    expect(MandatoryAppTag.PRODUCT).toBe('Product');
    expect(MandatoryAppTag.SERVICE).toBe('Service');
    expect(MandatoryAppTag.COMPONENT).toBe('Component');
    expect(MandatoryAppTag.ENVIRONMENT).toBe('Environment');
    expect(MandatoryAppTag.OWNER).toBe('Owner');
    expect(MandatoryAppTag.SOURCE).toBe('Source');
  });
});

describe('GOV_UK_MANDATORY_APP_TAG_KEYS', () => {
  it('has 6 entries matching MandatoryAppTag values', () => {
    expect(GOV_UK_MANDATORY_APP_TAG_KEYS).toHaveLength(6);
    expect(GOV_UK_MANDATORY_APP_TAG_KEYS).toEqual(
      expect.arrayContaining(Object.values(MandatoryAppTag)),
    );
  });
});
