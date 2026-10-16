import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { CfnCluster } from 'aws-cdk-lib/aws-dsql';
import { IFunction, StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { IQueue, Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { GovUkOnceEnvironments } from '../macie';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import {
  InterfaceVpcEndpoint,
  InterfaceVpcEndpointService,
  IVpc,
  Peer,
  Port,
  SecurityGroup,
  SubnetSelection,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import {
  getLogRetentionPeriod,
  getRemovalPolicy,
} from 'cdk/constants/environment';
import { LambdaApiConstruct } from '../constructs/lambda-construct';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { mainStackParameterNames } from 'cdk/constants/shared-parameters';
import { SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources';

const DSQL_PORT = 5432;

export interface LiveSchemaStackProps extends StackProps {
  developerId?: string;
  environment: string;
  stackPrefix: string;
  createDsqlVpcEndpoint?: boolean;
}

export class LiveSchemaStack extends Stack {
  public readonly schemaExtractorLambda: IFunction;

  public readonly lambdas: IFunction[];
  public readonly cluster: CfnCluster;
  public readonly failureQueue: IQueue;

  constructor(scope: Construct, id: string, props: LiveSchemaStackProps) {
    super(scope, id, props);

    const {
      developerId,
      environment,
      stackPrefix,
      createDsqlVpcEndpoint = !developerId,
    } = props;

    const isStageOrProd =
      environment === GovUkOnceEnvironments.Prod ||
      environment === GovUkOnceEnvironments.Stag;

    const namePrefix = developerId ? `${developerId}-` : '';

    const params = mainStackParameterNames(stackPrefix);
    const resolve = (name: string) =>
      StringParameter.valueForStringParameter(this, name);

    const kmsKey = Key.fromKeyArn(this, 'KmsKey', resolve(params.kmsKeyArn));
    const dbKmsKey = Key.fromKeyArn(
      this,
      'DbKmsKey',
      resolve(params.dbKmsKeyArn),
    );

    const dataTable = Table.fromTableAttributes(this, 'DataTable', {
      tableName: `${namePrefix}udp-data-${environment}`,
      tableStreamArn: resolve(params.dataTableStreamArn),
      encryptionKey: kmsKey,
    });

    const vpc = Vpc.fromLookup(this, 'Vpc', {
      vpcName: `udp-api-vpc-${environment}`,
    });

    const isolatedSubnets = { subnetType: SubnetType.PRIVATE_ISOLATED };

    const lambdaSecurityGroup = this.createLambdaSecurityGroup(
      vpc,
      `${namePrefix}live-schema-lambda-dg-${environment}`,
    );

    this.cluster = new CfnCluster(this, 'Cluster', {
      deletionProtectionEnabled: isStageOrProd,
      tags: [{ key: 'Name', value: `${namePrefix}live-schema-${environment}` }],
    });

    this.cluster.applyRemovalPolicy(getRemovalPolicy(environment));

    if (createDsqlVpcEndpoint) {
      this.createDsqlEndpoint(vpc, isolatedSubnets, environment);
    }

    const commonLambdaProps = {
      developerId,
      environment,
      kmsKey,
      vpc,
      vpcSubnets: isolatedSubnets,
      securityGroups: [lambdaSecurityGroup],
      logRetentionDays: getLogRetentionPeriod(environment),
    };

    const schemaExtractor = new LambdaApiConstruct(
      this,
      'LiveSchemaExtractor',
      {
        ...commonLambdaProps,
        functionName: 'liveSchemaExtractorLambda',
        sourcePath: 'liveSchemaExtractorLambda',
        dbKmsKey,
        timeout: Duration.seconds(60),
        environmentVariables: this.lambdaEnv(
          stackPrefix,
          'liveSchemaExtractor',
        ),
      },
    ).function;

    this.grantDsql(schemaExtractor, 'dsql:DbConnectAdmin');

    this.failureQueue = new Queue(this, 'StreamFailurQueue', {
      queueName: `${namePrefix}live-schema-stream-failures-${environment}`,
      encryption: QueueEncryption.KMS,
      encryptionMasterKey: kmsKey,
      retentionPeriod: Duration.days(14),
    });

    dataTable.grantStreamRead(schemaExtractor);
    schemaExtractor.addEventSourceMapping('DataTableStream', {
      eventSourceArn: dataTable.tableStreamArn,
      startingPosition: StartingPosition.LATEST,
      batchSize: 100,
      maxBatchingWindow: Duration.seconds(5),
      bisectBatchOnError: true,
      retryAttempts: 5,
      maxRecordAge: Duration.days(1),
      onFailure: new SqsDlq(this.failureQueue),
    });

    this.schemaExtractorLambda = schemaExtractor;
    this.lambdas = [schemaExtractor];

    new CfnOutput(this, 'DsqlClusterEndpoint', {
      value: this.cluster.attrEndpoint,
      description: 'Aurora DSQL cluster endpoint for live schmeas',
    });

    new CfnOutput(this, 'DsqlClusterArn', {
      value: this.cluster.attrResourceArn,
      description: 'Aurora DSQL cluster Arn for live schmeas',
    });
  }

  private lambdaEnv(
    stackPrefix: string,
    serviceName: string,
  ): Record<string, string> {
    return {
      STACK: stackPrefix,
      SERVICE_NAME: serviceName,
      POWERTOOLS_SERVICE_NAME: serviceName,
      DSQL_ENDPOINT: this.cluster.attrEndpoint,
    };
  }

  private grantDsql(fn: IFunction, action: string): void {
    fn.addToRolePolicy(
      new PolicyStatement({
        actions: [action],
        resources: [this.cluster.attrResourceArn],
      }),
    );
  }

  private createLambdaSecurityGroup(
    vpc: IVpc,
    securityGroupName: string,
  ): SecurityGroup {
    const sg = new SecurityGroup(this, 'LambdaSg', {
      vpc,
      securityGroupName,
      description: 'Live Schema lambdas - outbound to VPX endpoints and DSQL',
      allowAllOutbound: false,
    });

    const vpcCidr = Peer.ipv4(vpc.vpcCidrBlock);
    sg.addEgressRule(vpcCidr, Port.tcp(443), 'HTTPS to VPC endpoints');
    sg.addEgressRule(vpcCidr, Port.tcp(DSQL_PORT), 'POSTgress tp DSQL');
    sg.addEgressRule(vpcCidr, Port.udp(53), 'DNS (UDP) to VPC resolver');
    sg.addEgressRule(vpcCidr, Port.tcp(53), 'DNS (TCP) to VPC resolver');

    return sg;
  }

  private createDsqlEndpoint(
    vpc: IVpc,
    subnets: SubnetSelection,
    environment: string,
  ): InterfaceVpcEndpoint {
    const sg = new SecurityGroup(this, 'DSQLEndpointSg', {
      vpc,
      securityGroupName: `dsql-endpojnt-sg-${environment}`,
      description: `DSQL VPC endpoint - Postgres from VPC CIDR`,
      allowAllOutbound: false,
    });

    sg.addIngressRule(
      Peer.ipv4(vpc.vpcCidrBlock),
      Port.tcp(DSQL_PORT),
      'Postgres from VPC CIDR',
    );

    return new InterfaceVpcEndpoint(this, 'DSQLEndpoint', {
      vpc,
      service: new InterfaceVpcEndpointService(
        this.cluster.attrVpcEndpointServiceName,
        DSQL_PORT,
      ),
      privateDnsEnabled: true,
      subnets,
      securityGroups: [sg],
    });
  }
}
