export const RISK_POLICY_VERSION = "HO-SAFETY-RISK-1.0";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function equipmentPoints(asset) {
  if (asset?.fault?.severity === "CRITICAL") return 25;
  if (asset?.fault?.severity === "HIGH") return 23;
  if (asset?.status === "WARNING") return 10;
  return 0;
}

function distancePoints(distance) {
  if (distance <= 5) return 25;
  if (distance <= 8) return 18;
  if (distance <= 15) return 8;
  return 0;
}

function ppePoints(ppe) {
  return (ppe.helmet ? 0 : 7) + (ppe.harness ? 0 : 8) + (ppe.vest ? 0 : 5);
}

function permitPoints(status) {
  if (status === "EXPIRED" || status === "INVALID") return 15;
  if (status === "EXPIRING") return 9;
  return 0;
}

export function levelFromScore(score) {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

export function calculateWorkerRisk(worker, assignedAsset) {
  const factors = [
    { key: "equipment", label: "설비 이상 심각도", score: equipmentPoints(assignedAsset), max: 25, evidence: assignedAsset?.fault ? `${assignedAsset.fault.severity} · ${assignedAsset.fault.symptom}` : assignedAsset?.status || "NORMAL" },
    { key: "distance", label: "이상 설비 접근 거리", score: distancePoints(worker.distanceToFault), max: 25, evidence: `${worker.distanceToFault}m` },
    { key: "ppe", label: "PPE 미착용", score: ppePoints(worker.ppe), max: 20, evidence: [!worker.ppe.helmet && "안전모", !worker.ppe.harness && "안전대", !worker.ppe.vest && "안전조끼"].filter(Boolean).join(" · ") || "전 항목 착용" },
    { key: "permit", label: "작업허가서", score: permitPoints(worker.permitStatus), max: 15, evidence: worker.permitStatus },
    { key: "qualification", label: "작업 자격", score: worker.qualificationValid ? 0 : 10, max: 10, evidence: worker.qualificationValid ? "유효" : "자격 재확인 필요" },
    { key: "assignment", label: "고장 설비 직접 작업", score: assignedAsset?.fault ? 5 : 0, max: 5, evidence: assignedAsset?.fault ? "직접 배정" : "해당 없음" },
  ];
  const score = clamp(factors.reduce((sum, factor) => sum + factor.score, 0), 0, 100);
  const level = levelFromScore(score);
  const evidenceCount = [worker.cameraId, worker.locationSource, worker.permitId, assignedAsset?.sensors?.length].filter(Boolean).length;
  const evidenceConfidence = 80 + evidenceCount * 4;
  const controls = {
    ppeRestored: clamp(score - ppePoints(worker.ppe), 0, 100),
    movedToSafeZone: clamp(score - distancePoints(worker.distanceToFault), 0, 100),
    equipmentIsolated: clamp(score - equipmentPoints(assignedAsset) - (assignedAsset?.fault ? 5 : 0), 0, 100),
    allRecommended: clamp(score - ppePoints(worker.ppe) - distancePoints(worker.distanceToFault) - equipmentPoints(assignedAsset) - (assignedAsset?.fault ? 5 : 0), 0, 100),
  };
  const recommendation = score >= 80 ? "즉시 작업 중지 · 안전구역 대피 · 설비 격리" : score >= 60 ? "관리자 확인 전 작업 보류" : score >= 30 ? "허가·자격 재검증" : "작업 지속 모니터링";
  return { score, level, factors, controls, recommendation, evidenceConfidence, policyVersion: RISK_POLICY_VERSION };
}

export function evaluateFactoryWorkers(factory) {
  const workers = factory.workers.map((worker) => {
    const asset = factory.equipment.find((item) => item.assetCode === worker.assignedAssetCode);
    const analysis = calculateWorkerRisk(worker, asset);
    return { ...worker, riskScore: analysis.score, riskLevel: analysis.level, recommendedAction: analysis.recommendation, riskAnalysis: analysis };
  });
  return { ...factory, workers, exposedWorkers: workers.filter((worker) => worker.riskScore >= 60).length };
}
