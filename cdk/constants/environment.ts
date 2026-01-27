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
