import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { ISecurityGroup, IVpc } from 'aws-cdk-lib/aws-ec2';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { ITopic } from 'aws-cdk-lib/aws-sns';
import { CodeBuildPerfConstruct } from '../constructs/codebuild-perf-construct';
import { Construct } from 'constructs';
import { Rule } from 'aws-cdk-lib/aws-events';
import { SnsTopic } from 'aws-cdk-lib/aws-events-targets';

export interface PerfStackProps extends StackProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly vpc: IVpc;
  readonly codeBuildSecurityGroup: ISecurityGroup;
  readonly apiEndpoint: string;
  readonly apiId: string;
  readonly e2eTestConsumerRole?: IRole;
  readonly e2eTestConsumerApiKeyValue?: string;
  readonly sourceBucketName: string;
  readonly warningTopic: ITopic;
}

export class PerfStack extends Stack {
  public readonly cudebuildProject: CodeBuildPerfConstruct;

  constructor(scope: Construct, id: string, props: PerfStackProps) {
    super(scope, id, props);

    const {
      developerId,
      environment,
      vpc,
      codeBuildSecurityGroup,
      apiEndpoint,
      apiId,
      e2eTestConsumerRole,
      e2eTestConsumerApiKeyValue,
      sourceBucketName,
      warningTopic,
    } = props;

    const resourcePrefix = developerId
      ? `${developerId}-${environment}`
      : environment;

    this.cudebuildProject = new CodeBuildPerfConstruct(this, 'CodeBuild', {
      developerId,
      environment,
      vpc,
      securityGroups: [codeBuildSecurityGroup],
      apiEndpoint,
      apiId,
      awsRegion: this.region,
      sourceBucket: sourceBucketName,
      e2eTestConsumerRole,
      e2eTestConsumerApiKeyValue,
    });

    new Rule(this, `PerfTestFailureRule`, {
      ruleName: `${resourcePrefix}-perf-test-failure`,
      description: `Alert on performance test failures for ${resourcePrefix}`,
      eventPattern: {
        source: ['aws.codebuild'],
        detailType: ['Codebuild Build State Change'],
        detail: {
          'build-status': ['FAILED', 'STAPPED', 'TIMED_OUT'],
          'project-name': [this.cudebuildProject.project.projectName],
        },
      },
      targets: [new SnsTopic(warningTopic)],
    });

    new CfnOutput(this, 'PerfCodeBuildProjectName', {
      value: this.cudebuildProject.project.projectName,
      description: 'Codebuild project name for performance test',
      exportName: `${id}-PerCodeBuildProjectName`,
    });

    new CfnOutput(this, 'PerfCodeBuildProjectArn', {
      value: this.cudebuildProject.project.projectArn,
      description: 'Codebuild project ARN for performance test',
      exportName: `${id}-PerCodeBuildProjectArn`,
    });
  }
}
