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
  Test = 'test',
  Stag = 'stag',
  Prod = 'prod',
}

export function getRemovalPolicy(enviroment: string): RemovalPolicy {
  if (
    enviroment === GovUkOnceEnvironments.Prod ||
    enviroment === GovUkOnceEnvironments.Prod
  ) {
    return RemovalPolicy.RETAIN;
  }
  return RemovalPolicy.DESTROY;
}
