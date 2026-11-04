import {
  ResourceGroupsTaggingAPIClient,
  paginateGetResources,
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

  const paginator = paginateGetResources(
    { client },
    {
      TagFilters: [{ Key: 'Monitor', Values: ['true'] }],
      ResourceTypeFilters: ['lambda:function', 'dynamodb:table'],
    },
  );

  for await (const page of paginator) {
    for (const resource of page.ResourceTagMappingList ?? []) {
      const classified = classifyResource(
        resource.ResourceARN,
        environment,
        developerId,
      );
      if (!classified) continue;
      if (classified.type === 'lambda') lambdaNames.push(classified.name);
      else tableNames.push(classified.name);
    }
  }

  return {
    lambdaNames: [...new Set(lambdaNames)].sort((a, b) => a.localeCompare(b)),
    tableNames: [...new Set(tableNames)].sort((a, b) => a.localeCompare(b)),
  };
}

function classifyResource(
  arn: string | undefined,
  environment: string,
  developerId: string | undefined,
): { type: 'lambda' | 'table'; name: string } | null {
  if (!arn) return null;

  if (arn.includes(':function:')) {
    const name = arn.split(':function:')[1];
    return name && matchesEnv(name, environment, developerId)
      ? { type: 'lambda', name }
      : null;
  }

  if (arn.includes(':table/')) {
    const name = arn.split(':table/')[1];
    return name && matchesEnv(name, environment, developerId)
      ? { type: 'table', name }
      : null;
  }

  return null;
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
