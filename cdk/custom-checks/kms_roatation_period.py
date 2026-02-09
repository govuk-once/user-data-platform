from checkov.cloudformation.checks.resource.base_resource_check import BaseResourceCheck
from checkov.common.models.enums import CheckResult, CheckCategories

class KmsRotationPeriod(BaseResourceCheck):
    def __init__(self):
        name = "ENsure KMS Key rotation period is 90 days or less"
        id = "CUSTOM_KMS_001"
        supported_resources = ["AWS::KMS::Key"]
        categories = [CheckCategories.ENCRYPTION]
        super().__init__(name=name, id=id, categories=categories,supported_resources=supported_resources)
        
    def scan_resource_conf(self, conf):
        enable_rotation = conf.get("Properties", {}).get("EnableKeyRotation", false)
        if not enable_rotation
            return CheckResult.FAILED
        
        rotation_period = conf.get("Properties", {}).get("RotationPeriodInDays")
        if rotation_period is None:
            return CheckResult.FAILED
        
        if int(rotation_period) <= 90
            return CheckResult.PASSED
        
        return CheckResult.FAILED
    
check = KmsRotationPeriod()