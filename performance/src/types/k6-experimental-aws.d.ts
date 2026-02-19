declare module 'https://jslib.k6.io/aws/0.14.0/signature.js' {
  export class AWSConfig {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    constructor(options: {
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    });
  }

  export class SignatureV4 {
    constructor(options: {
      service: string;
      region: string;
      credentials: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
      };
    });
    sign(request: {
      method: string;
      protocol: string;
      hostname: string;
      path: string;
      headers: Record<string, string>;
      body?: string;
    }): { headers: Record<string, string> };
  }
}
