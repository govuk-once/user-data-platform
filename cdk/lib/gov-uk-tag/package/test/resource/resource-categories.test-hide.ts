import { describe, it, expect } from 'vitest';

import { RESOURCE_CATEGORIES } from '../../src/resource/resource-categories';
import { ResourceCategory } from '../../src/resource/resource-category.const';

describe('RESOURCE_CATEGORIES', () => {
  const entries = Object.entries(RESOURCE_CATEGORIES);
  const validCategories = new Set(Object.values(ResourceCategory));

  it('has a reasonable number of profiles', () => {
    expect(entries.length).toBeGreaterThanOrEqual(20);
  });

  it('has no duplicate cfnTypes across profiles', () => {
    const seen = new Map<string, string>();

    for (const [key, profile] of entries) {
      for (const cfnType of profile.cfnTypes) {
        const existing = seen.get(cfnType);
        if (existing) {
          throw new Error(
            `Duplicate cfnType '${cfnType}' in '${key}' and '${existing}'`,
          );
        }
        seen.set(cfnType, key);
      }
    }
  });

  it('every profile has a non-empty label', () => {
    for (const [key, profile] of entries) {
      expect(profile.label, `${key} should have a label`).toBeTruthy();
      expect(
        profile.label.length,
        `${key} label should not be empty`,
      ).toBeGreaterThan(0);
    }
  });

  it('every profile has at least one cfnType', () => {
    for (const [key, profile] of entries) {
      expect(
        profile.cfnTypes.length,
        `${key} should have at least one cfnType`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('every profile has a valid ResourceCategory', () => {
    for (const [key, profile] of entries) {
      expect(
        validCategories.has(profile.category),
        `${key} has invalid category '${profile.category}'`,
      ).toBe(true);
    }
  });

  it('every profile has boolean flags', () => {
    for (const [key, profile] of entries) {
      expect(typeof profile.piiRequired, `${key}.piiRequired`).toBe('boolean');
      expect(
        typeof profile.dataClassificationRequired,
        `${key}.dataClassificationRequired`,
      ).toBe('boolean');
      expect(typeof profile.exposureRequired, `${key}.exposureRequired`).toBe(
        'boolean',
      );
    }
  });

  it('all cfnTypes follow AWS format', () => {
    for (const [key, profile] of entries) {
      for (const cfnType of profile.cfnTypes) {
        expect(cfnType, `${key} has malformed cfnType '${cfnType}'`).toMatch(
          /^AWS::\w+::\w+$/,
        );
      }
    }
  });

  it('contains known resource profiles', () => {
    expect(RESOURCE_CATEGORIES).toHaveProperty('LambdaFunction');
    expect(RESOURCE_CATEGORIES).toHaveProperty('S3Bucket');
    expect(RESOURCE_CATEGORIES).toHaveProperty('DynamoDbTable');
  });
});
