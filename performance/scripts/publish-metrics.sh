set -euo pipefail

SUMMARY_FILE="tmp/k6-summary.json"

if [[ ! -f "$SUMMARY_FILE" ]]; then
    echo "No k6 file found at ${SUMMARY_FILE} - skipping Cloudwatch publish"
    exit 0
fi

NAMESPACE="UDP/PerformanceTests"
ENV="${ENVIRONMENT:-unknown}"
SCENARIO="${PERF_TEST:-unknown}"

read -r P95_LATENCY ERROR_RATE TOTAL_REQUESTS AVG_RPS <<< "$(node -e "
    const s = JSON.parse(require('fs').readFileSync('${SUMMARY_FILE}', 'utf8'));
    const duration = s.metrics?.http_req_duration?.values || {};
    const failed = s.metrics?.http_req_failed?.values || {};
    const reqs = s.metrics?.http_reqs?.values || {};
    const p95 = duration['p(95)'] || 0;
    const errorRate = failed.rate || 0;
    const totalReqs = reqs.count || 0;
    const avgRps = reqs.rate || 0;
    console.log([p95, errorRate,totalReqs, avgRps].join(' '));
")"

echo "Publishing metrics to Cloudwatch namespace: ${NAMESPACE}"


aws cloudwatch put-metric-data \
    --namespace "${NAMESPACE}" \
    --metric-data \
        "MetricName=P95Latency,Value=${P95_LATENCY},Unit=Milliseconds,Dimensions=[{Name=Environment,Value=${ENV}},{Name=scenario,Value=${SCENARIO}}]" \
        "MetricName=ErrorRate,Value=${ERROR_RATE},Unit=None,Dimensions=[{Name=Environment,Value=${ENV}},{Name=scenario,Value=${SCENARIO}}]" \
        "MetricName=TotalRequests,Value=${TOTAL_REQUESTS},Unit=Count,Dimensions=[{Name=Environment,Value=${ENV}},{Name=scenario,Value=${SCENARIO}}]" \
        "MetricName=AvgRPS,Value=${AVG_RPS},Unit=Count/Second,Dimensions=[{Name=Environment,Value=${ENV}},{Name=scenario,Value=${SCENARIO}}]"


echo "metrics published successfully"
