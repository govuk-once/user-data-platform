import { RemovalPolicy } from 'aws-cdk-lib';
import {
  name as serviceName,
  team,
  repository,
  version,
} from '../../package.json';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

export type RepoMetaData = {
  serviceName: string;
  teamName: string;
  repositoryUrl: string;
  version: string;
};

export const repoMetaData: RepoMetaData = {
  serviceName,
  teamName: team,
  repositoryUrl: repository.url,
  version: version,
};

export enum GovUkOnceEnvironments {
  Dev = 'dev',
  Stag = 'stag',
  Prod = 'prod',
}

export const environmentLongNames: Record<string, string> = {
  [GovUkOnceEnvironments.Dev]: 'development',
  [GovUkOnceEnvironments.Stag]: 'staging',
  [GovUkOnceEnvironments.Prod]: 'production',
};

export function getRemovalPolicy(environment: string): RemovalPolicy {
  if (
    environment === GovUkOnceEnvironments.Prod ||
    environment === GovUkOnceEnvironments.Stag
  ) {
    return RemovalPolicy.RETAIN;
  }
  return RemovalPolicy.DESTROY;
}

export function getLogRetentionPeriod(environment: string): RetentionDays {
  if (
    environment === GovUkOnceEnvironments.Prod ||
    environment === GovUkOnceEnvironments.Stag
  ) {
    return RetentionDays.ONE_YEAR;
  }
  return RetentionDays.ONE_MONTH;
}
