import { describe, it, expect } from 'vitest';
import { validateConsumers, composePolicy } from './policy';

const OWN = {
  ownAccountId: '111111111111',
  ownVpcEndpointId: 'vpce-0own00000000000a',
  region: 'eu-west-2',
  restApiId: 'abc123',
};

describe('validateConsumers', () => {
  it('accepts well-formed entries', () => {
    const { valid, errors } = validateConsumers([
      {
        name: 'flex',
        accountId: '222222222222',
        vpcEndpointId: 'vpce-0aaa00000000000a',
      },
    ]);
    expect(errors).toEqual([]);
    expect(valid).toEqual([
      {
        name: 'flex',
        accountId: '222222222222',
        vpcEndpointId: 'vpce-0aaa00000000000a',
      },
    ]);
  });

  it('rejects bad account ids, bad vpce ids and missing fields', () => {
    const { valid, errors } = validateConsumers([
      {
        name: 'badAcct',
        accountId: '123',
        vpcEndpointId: 'vpce-0aaa00000000000a',
      },
      {
        name: 'badVpce',
        accountId: '222222222222',
        vpcEndpointId: 'not-a-vpce',
      },
      { name: 'missing' },
    ]);
    expect(valid).toEqual([]);
    expect(errors).toHaveLength(3);
  });

  it('rejects the same vpce claimed by two different accounts', () => {
    const { valid, errors } = validateConsumers([
      {
        name: 'a',
        accountId: '222222222222',
        vpcEndpointId: 'vpce-0abcdef123456789a',
      },
      {
        name: 'b',
        accountId: '333333333333',
        vpcEndpointId: 'vpce-0abcdef123456789a',
      },
    ]);
    expect(valid).toHaveLength(1);
    expect(valid[0].name).toBe('a');
    expect(errors[0]).toMatch(/already claimed/);
  });
});

describe('composePolicy', () => {
  it('fails closed with no consumers (own access only)', () => {
    const doc = composePolicy({ ...OWN, consumers: [] });
    expect(doc.Statement.map((s) => s.Sid)).toEqual([
      'DenyNonAllowlistedVpce',
      'DenyMissingVpce',
      'AllowOwnVpce',
    ]);
    const deny = doc.Statement.find((s) => s.Sid === 'DenyNonAllowlistedVpce')!;
    expect(deny.Condition.StringNotEquals['aws:sourceVpce']).toEqual([
      OWN.ownVpcEndpointId,
    ]);
  });

  it('adds an account-paired allow per consumer and extends the allow-list', () => {
    const consumers = [
      {
        name: 'flex',
        accountId: '222222222222',
        vpcEndpointId: 'vpce-0aaa00000000000a',
      },
    ];
    const doc = composePolicy({ ...OWN, consumers });

    const deny = doc.Statement.find((s) => s.Sid === 'DenyNonAllowlistedVpce')!;
    expect(deny.Condition.StringNotEquals['aws:sourceVpce']).toEqual([
      OWN.ownVpcEndpointId,
      'vpce-0aaa00000000000a',
    ]);

    const allow = doc.Statement.find((s) => s.Sid === 'AllowConsumerflex')!;
    expect(allow.Effect).toBe('Allow');
    expect(allow.Principal).toEqual({ AWS: 'arn:aws:iam::222222222222:root' });
    expect(allow.Condition.StringEquals['aws:sourceVpce']).toBe(
      'vpce-0aaa00000000000a',
    );
  });

  it('always denies requests with no sourceVpce', () => {
    const doc = composePolicy({ ...OWN, consumers: [] });
    const deny = doc.Statement.find((s) => s.Sid === 'DenyMissingVpce')!;
    expect(deny.Effect).toBe('Deny');
    expect(deny.Condition.Null['aws:sourceVpce']).toBe('true');
  });
});