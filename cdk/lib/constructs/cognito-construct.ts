import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

export interface M2MClientConfig {
  readonly scopes: string[];
  readonly accessTokenValidityMinutes?: number;
}

export interface ResourceServerScope {
  readonly name: string;
  readonly description: string;
}

export interface CognitoConstructProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly userPoolName?: string;
  readonly domainPrefix?: string;
  readonly resourceServerIdentifier?: string;
  readonly resourceServerName?: string;
  readonly resorceServerScopes?: ResourceServerScope[];
  readonly m2mClients?: Record<string, M2MClientConfig>;
}

export class CognitoConstruct extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolDomain: cognito.UserPoolDomain;
  public readonly resourceServer: cognito.UserPoolResourceServer;
  public readonly m2mClients: Map<string, cognito.UserPoolClient> = new Map();

  constructor(scope: Construct, id: string, props: CognitoConstructProps) {
    super(scope, id);

    const {
      developerId,
      environment,
      userPoolName = 'gov-uk-udp-api-auth',
      domainPrefix = 'gov-uk-udp-api-auth',
      resourceServerIdentifier = 'udp',
      resourceServerName = 'API',
      resorceServerScopes = [
        { name: 'read', description: 'Read access to api' },
        { name: 'write', description: 'Write access to api' },
        { name: 'delete', description: 'Delete access to api' },
      ],
      m2mClients = {
        flex: {
          scopes: ['udp/read', 'udp/write', 'udp/delete'],
          accessTokenValidityMinutes: 60,
        },
      },
    } = props;

    const resourcePrefix = developerId
      ? `${developerId}-${userPoolName}`
      : userPoolName;

    const fullDomainPrefix = developerId
      ? `${developerId}-${domainPrefix}-${environment}`
      : `${domainPrefix}-${environment}`;

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${resourcePrefix}-${environment}`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.NONE,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.userPoolDomain = this.userPool.addDomain('Domain', {
      cognitoDomain: {
        domainPrefix: fullDomainPrefix,
      },
    });

    this.resourceServer = this.userPool.addResourceServer('ResourceServer', {
      identifier: resourceServerIdentifier,
      userPoolResourceServerName: `${resourceServerName}-${environment}`,
      scopes: resorceServerScopes.map((s) => ({
        scopeName: s.name,
        scopeDescription: s.description,
      })),
    });

    for (const [clientName, clientConfig] of Object.entries(m2mClients)) {
      const oauthScopes = clientConfig.scopes.map((scopeName: string) => {
        const scopePart = scopeName.includes('/')
          ? scopeName.split('/')[1]
          : scopeName;
        return cognito.OAuthScope.resourceServer(
          this.resourceServer,
          new cognito.ResourceServerScope({
            scopeName: scopePart,
            scopeDescription: scopePart,
          }),
        );
      });

      const client = this.userPool.addClient(`Client-${clientName}`, {
        userPoolClientName: `${clientName}-${environment}`,
        generateSecret: true,
        oAuth: {
          flows: {
            clientCredentials: true,
          },
          scopes: oauthScopes,
        },
        accessTokenValidity: Duration.minutes(
          clientConfig.accessTokenValidityMinutes ?? 60,
        ),
        preventUserExistenceErrors: true,
      });

      this.m2mClients.set(clientName, client);
    }
  }

  get issuerUrl(): string {
    return `https://cognito-idp.${this.userPool.stack.region}.amazonaws.com/${this.userPool.userPoolId}`;
  }

  get tokenEndpoint(): string {
    return `https://${this.userPoolDomain.domainName}.auth.${this.userPool.stack.region}.amazoncognito.com/oauth2/token`;
  }
}
