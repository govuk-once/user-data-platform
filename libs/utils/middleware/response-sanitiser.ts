import type { MiddlewareObj } from '@middy/core';

const omitvalues = ['ttl', 'pk', 'sk', 'udpId', 'lsi', 'lsi_1', '__dataKey'];

type SanitiseOptions = {
  omitKeys?: string[];
  deep?: boolean;
};

const sanitiseObject = (
  value: unknown,
  omitKeys: Set<string>,
  deep: boolean,
): unknown => {
  if (Array.isArray(value)) {
    return value.map((v) => sanitiseObject(v, omitKeys, deep));
  }

  if (value && typeof value === 'object') {
    const sanitised = Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !omitKeys.has(key))
        .map(([keyof, val]) => [
          keyof,
          deep ? sanitiseObject(val, omitKeys, deep) : val,
        ]),
    );

    return sanitised;
  }

  return value;
};

export function responseSanitiser(options: SanitiseOptions): MiddlewareObj {
  return {
    after: async (request) => {
      const response = request.response;
      if (!response || !('body' in response)) return;

      const ommitSet = new Set(options.omitKeys ?? omitvalues);
      const deep = options.deep ?? false;

      const parsedBody =
        typeof response.body === 'string'
          ? JSON.parse(response.body)
          : response.body;

      const sanitised = sanitiseObject(parsedBody, ommitSet, deep);

      response.body =
        typeof response.body === 'string'
          ? JSON.stringify(sanitised)
          : sanitised;
    },
  };
}
