import { CfnResource, IAspect } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

export class CheckovSuppressionAspect implements IAspect {
  visit(node: IConstruct): void {
    if (
      node instanceof CfnResource &&
      node.cfnResourceType === 'AWS::Lambda::Function'
    ) {
      if (node.node.path.includes('CustomResourceProvider')) {
        node.addMetadata('checkov', {
          skip: [
            {
              id: 'CKV_AWS_115',
              comment:
                'CDK Custom resource lambda - cannot configure reserver concurrency',
            },
            {
              id: 'CKV_AWS_117',
              comment: 'CDK Custom resource lambda - cannot configure vpc',
            },
          ],
        });
      }
    }
  }
}
