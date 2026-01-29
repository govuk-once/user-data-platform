import { RemovalPolicy } from 'aws-cdk-lib';
import {
  name as serviceName,
  team,
  repository,
  version,
} from '../../package.json';

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

export function getRemovalPolicy(environment: string): RemovalPolicy {
  if (
    environment === GovUkOnceEnvironments.Prod ||
    environment === GovUkOnceEnvironments.Prod
  ) {
    return RemovalPolicy.RETAIN;
  }
  return RemovalPolicy.DESTROY;
}
