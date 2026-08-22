import { describe, it, expect } from 'vitest';

import { GovUKTag } from '../../../gov-uk-tag.class';
import { GovUKEnvironments } from '../../../gov-uk-tag.const';
import { OnceSuggestedAppTags } from '../../src/tag/tag.const';

describe('OnceTag', () => {
  describe('mapEnvironment', () => {
    it('maps short "dev" to DEVELOPMENT', () => {
      expect(GovUKTag.Once.mapEnvironment('dev')).toBe(
        GovUKEnvironments.DEVELOPMENT,
      );
    });

    it('maps short "stag" to STAGING', () => {
      expect(GovUKTag.Once.mapEnvironment('stag')).toBe(
        GovUKEnvironments.STAGING,
      );
    });

    it('maps short "prod" to PRODUCTION', () => {
      expect(GovUKTag.Once.mapEnvironment('prod')).toBe(
        GovUKEnvironments.PRODUCTION,
      );
    });

    it('passes through full environment names', () => {
      expect(GovUKTag.Once.mapEnvironment('sandbox')).toBe(
        GovUKEnvironments.SANDBOX,
      );
      expect(GovUKTag.Once.mapEnvironment('build')).toBe(
        GovUKEnvironments.BUILD,
      );
      expect(GovUKTag.Once.mapEnvironment('development')).toBe(
        GovUKEnvironments.DEVELOPMENT,
      );
      expect(GovUKTag.Once.mapEnvironment('integration')).toBe(
        GovUKEnvironments.INTEGRATION,
      );
      expect(GovUKTag.Once.mapEnvironment('staging')).toBe(
        GovUKEnvironments.STAGING,
      );
      expect(GovUKTag.Once.mapEnvironment('production')).toBe(
        GovUKEnvironments.PRODUCTION,
      );
    });

    it('is case-insensitive', () => {
      expect(GovUKTag.Once.mapEnvironment('PRODUCTION')).toBe(
        GovUKEnvironments.PRODUCTION,
      );
      expect(GovUKTag.Once.mapEnvironment('Dev')).toBe(
        GovUKEnvironments.DEVELOPMENT,
      );
    });

    it('throws on empty string', () => {
      expect(() => GovUKTag.Once.mapEnvironment('')).toThrow(
        'Environment is empty',
      );
    });

    it('throws on unrecognised environment', () => {
      expect(() => GovUKTag.Once.mapEnvironment('invalid')).toThrow(
        'Environment not found',
      );
    });
  });

  describe('Suggested', () => {
    it('exposes Flex, UDP, and UNS presets', () => {
      const suggested = GovUKTag.Once.Suggested;
      expect(suggested).toHaveProperty('Flex');
      expect(suggested).toHaveProperty('UDP');
      expect(suggested).toHaveProperty('UNS');
    });

    it('each preset has all mandatory tag fields', () => {
      const mandatoryFields = [
        'Product',
        'Service',
        'Component',
        'Environment',
        'Owner',
        'Source',
      ];

      for (const preset of Object.values(OnceSuggestedAppTags)) {
        for (const field of mandatoryFields) {
          expect(preset).toHaveProperty(field);
          expect((preset as Record<string, unknown>)[field]).toBeTruthy();
        }
      }
    });

    it('each preset has a valid RepositoryUrl', () => {
      for (const preset of Object.values(OnceSuggestedAppTags)) {
        expect(preset.RepositoryUrl).toMatch(
          /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/,
        );
      }
    });
  });
});
