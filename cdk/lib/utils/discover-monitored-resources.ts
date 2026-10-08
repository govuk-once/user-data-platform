import {
  ResourceGroupsTaggingAPIClient,
  GetResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';

export interface MonitoringInventory {
  lambdaNames: string[];
  tableNames: string[];
}

export async function discoverMonitoredResources(
  region: string,
  environment: string,
  developerId?: string,
): Promise<MonitoringInventory> {
  const client = new ResourceGroupsTaggingAPIClient({ region });
  const lambdaNames: string[] = [];
  const tableNames: string[] = [];

  let paginationToken: string | undefined;

  do {
    const response = await client.send(
      new GetResourcesCommand({
        TagFilters: [
          {
            Key: 'Monitor',
            Values: ['true'],
          },
        ],
        ResourceTypeFilters: ['lambda:function', 'dynamodb:table'],
        PaginationToken: paginationToken,
      }),
    );

    for (const resource of response.ResourceTagMappingList ?? []) {
      const arn = resource.ResourceARN;
      if (!arn) continue;

      if (arn.includes(':function:')) {
        const name = arn.split(':function:')[1];
        if (name && matchesEnv(name, environment, developerId)) {
          lambdaNames.push(name);
        }
      } else if (arn.includes(':table/')) {
        const name = arn.split(':table/')[1];
        if (name && matchesEnv(name, environment, developerId)) {
          tableNames.push(name);
        }
      }
    }

    paginationToken = response.PaginationToken;
  } while (paginationToken);

  return {
    lambdaNames: [...new Set(lambdaNames)].sort(),
    tableNames: [...new Set(tableNames)].sort(),
  };
}

function matchesEnv(
  name: string,
  environment: string,
  developerId?: string,
): boolean {
  return developerId
    ? name.startsWith(`${developerId}-`) && name.endsWith(`-${environment}`)
    : !name.startsWith('pr-') && name.endsWith(`-${environment}`);
}
