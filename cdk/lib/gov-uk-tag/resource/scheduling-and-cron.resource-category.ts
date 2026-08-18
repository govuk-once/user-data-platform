import { ResourceCategory } from './resource-category.const';
import { defineProfiles } from './resource-category.util';

export const SCHEDULING_AND_CRON_RESOURCE_PROFILES = defineProfiles({
  EventBridgeScheduler: {
    category: ResourceCategory.SCHEDULING_AND_CRON,
    label: 'Amazon EventBridge Scheduler',
    cfnTypes: ['AWS::Scheduler::Schedule', 'AWS::Scheduler::ScheduleGroup'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: false,
  },
  EventBridgeScheduledRule: {
    category: ResourceCategory.SCHEDULING_AND_CRON,
    label: 'Amazon EventBridge Scheduled Rules',
    cfnTypes: ['AWS::Events::Rule'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: false,
  },
});
