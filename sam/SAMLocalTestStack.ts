import * as fs from 'fs';
import * as path from 'path';
import { Construct } from 'constructs';
import {
  AssetHashType,
  DockerImage,
  Duration,
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

import {
  Code,
  Function as LambdaFunction,
  Runtime,
} from 'aws-cdk-lib/aws-lambda';

import { routes } from '../libs/utils/schemas/routes/routes';

const REPO_ROOT = path.resolve(__dirname, '..');

const SHARED_ENV: Record<string, string> = {
  TABLE_NAME: 'udp-data-local',
  IDENTITY_TABLE_NAME: 'udp-identity-local',
  STACK: 'local',
  AWS_ENDPOINT_URL_DYNAMODB: 'http://dynamodb:8000',
  AWS_ENDPOINT_URL_SQS: 'http://elasticmq:9324',
};

const ASSET_EXCLUDES = [
  '.git',
  '.nx',
  'build',
  'dist',
  'coverage',
  'cdk.out',
  '.aws-sam',
  'sam/.aws-sam',
  'e2e',
  'performance',
  'docs',
  '**/*.test.ts',
  '**/*.unit.test.ts',
  'sam/tests',
];

const sharedCode = Code.fromAsset(REPO_ROOT, {
  exclude: ASSET_EXCLUDES,
  assetHash: 'sam-local-dev-v1',
  assetHashType: AssetHashType.CUSTOM,
  bundling: {
    image: DockerImage.fromRegistry('busybox'),
    local: {
      tryBundle(outputDir: string): boolean {
        try {
          fs.rmSync(outputDir, { recursive: true, force: true });
        } catch (error) {
          console.error(error);
        }
        fs.symlinkSync(REPO_ROOT, outputDir, 'dir');
        return true;
      },
    },
  },
});

export class SAMLocalTestStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const api = new apigateway.RestApi(this, 'LocalApi', {
      restApiName: 'udp-local',
      deployOptions: { stageName: 'local' },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
    });

    for (const [routeKey, route] of Object.entries(routes)) {
      const env: Record<string, string> = {
        ...SHARED_ENV,
        SERVICE_NAME: `udp-local-${routeKey}`,
        TARGET_HANDLER: `src/${routeKey}Lambda/handler.ts`,
      };

      if ('queueName' in route && route.queueName) {
        env.QUQUE_URL = `http://elasticmq:9342/000000000000/${route.queueName}`;
      }

      const fn = new LambdaFunction(this, `${routeKey}Fn`, {
        functionName: `udp-local-${routeKey}`,
        handler: 'sam/wrapper.handler',
        runtime: Runtime.NODEJS_20_X,
        code: sharedCode,
        timeout: Duration.seconds(30),
        memorySize: 512,
        environment: env,
      });

      const resource = api.root.resourceForPath(route.path);
      resource.addMethod(route.method, new apigateway.LambdaIntegration(fn));
    }
  }
}
