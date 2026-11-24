import { App, Aspects } from 'aws-cdk-lib';

import { MacieStack } from './macie-stack';
import { MacieAccessAspect } from './macie-access-aspect';

export enum GovUkOnceEnvironments {
  Dev = 'dev',
  Stag = 'stag',
  Prod = 'prod',
}

export interface MacieInstallProps {
  env: { account: string; region: string };
  stackPrefix: string;
  description?: string;
}

export function Macie(app: App, props: MacieInstallProps): void {
  new MacieStack(app, `${props.stackPrefix}-macie`, {
    env: props.env,
    description: props.description ?? 'Macie sensitive data discovery',
  });

  Aspects.of(app).add(new MacieAccessAspect());
}
