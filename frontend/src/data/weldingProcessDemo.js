import robotTimelineCsv from "../../.generated/welding/rb_weld_01_timeline.csv?raw";
import weldQualityCsv from "../../.generated/welding/weld_quality_seams.csv?raw";

const numericFields = new Set([
  "t_sec", "voltage", "current_amp", "wire_feed", "travel_speed",
  "torque_percent", "temperature_c", "gas_flow", "anomalyScore",
  "anomalyThreshold", "consecutiveCount", "seam_id", "voltage_mean",
  "voltage_std", "current_amp_mean", "current_amp_std", "wire_feed_mean",
  "wire_feed_std", "travel_speed_mean", "travel_speed_std",
  "torque_percent_mean", "torque_percent_std", "temperature_c_mean",
  "temperature_c_std", "gas_flow_mean", "gas_flow_min",
  "defectRiskProbability", "threshold",
]);

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function parseCsv(source) {
  const [headerLine, ...lines] = source.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => {
      const value = values[index] ?? "";
      if (value === "True") return [header, true];
      if (value === "False") return [header, false];
      return [header, numericFields.has(header) ? Number(value) : value];
    }));
  });
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const highRisk = (value, warning, danger) => clamp01((value - warning) / (danger - warning));
const lowRisk = (value, warning, danger) => clamp01((warning - value) / (warning - danger));
const deviationRisk = (value, target, warningRatio, dangerRatio) =>
  clamp01((Math.abs(value - target) / target - warningRatio) / (dangerRatio - warningRatio));

const scenarioMeta = {
  NORMAL: { label: "정상 용접", cause: "센서값이 안정 운전 범위에 있습니다.", qualityProfile: "STABLE_NORMAL" },
  CURRENT_SPIKE: { label: "용접 전류 급등", cause: "설정 전류 대비 편차가 증가해 아크 안정성이 저하됩니다.", qualityProfile: "CURRENT_UNSTABLE" },
  GAS_FLOW_DROP: { label: "보호가스 유량 저하", cause: "보호가스 유량 부족으로 기공 결함 위험이 증가합니다.", qualityProfile: "GAS_FLOW_UNSTABLE" },
  AXIS_OVERLOAD: { label: "로봇 축 과부하", cause: "축 토크가 정격 한계에 접근해 궤적 정밀도가 저하됩니다.", qualityProfile: "NOISY_NORMAL" },
  COMMUNICATION_LOSS: { label: "로봇 통신 단절", cause: "제어 데이터가 수신되지 않아 로봇이 안전 정지합니다.", qualityProfile: "NOISY_NORMAL" },
  WELD_QUALITY_DRIFT: { label: "용접 품질 드리프트", cause: "전압·전류 조건이 기준점에서 이탈해 품질 저하가 누적됩니다.", qualityProfile: "WELD_QUALITY_DRIFT_LIKE" },
};

export const robotTimeline = parseCsv(robotTimelineCsv);
export const weldQualitySeams = parseCsv(weldQualityCsv);
export const weldingScenarioStarts = [0, 6, 12, 18, 24, 30];
// 생산 시연 기본 분포: PASS 7개, RECHECK 2개, REWORK 1개.
// 통신 단절(HOLD)은 수동 시나리오에서만 재생한다.
export const weldingAutoplayScenarioStarts = [0, 0, 6, 0, 0, 12, 0, 0, 0, 30];

const qualityByProfile = weldQualitySeams.reduce((groups, seam) => {
  (groups[seam.profile] ||= []).push(seam);
  return groups;
}, {});

function selectQualitySeam(scenario, blockIndex) {
  const profile = scenarioMeta[scenario]?.qualityProfile || "STABLE_NORMAL";
  const rows = [...(qualityByProfile[profile] || weldQualitySeams)]
    .sort((a, b) => a.defectRiskProbability - b.defectRiskProbability);
  const ratio = scenario === "NORMAL" ? .3 : scenario === "AXIS_OVERLOAD" ? .58 : .82;
  const offset = blockIndex % 3 - 1;
  const index = Math.min(rows.length - 1, Math.max(0, Math.round((rows.length - 1) * ratio) + offset));
  return rows[index];
}

export function buildWeldingDemoFrame(index, productionIndex = Math.floor(index / 6)) {
  const frameIndex = ((index % robotTimeline.length) + robotTimeline.length) % robotTimeline.length;
  const telemetry = robotTimeline[frameIndex];
  const blockIndex = productionIndex;
  const stepInBlock = frameIndex % 6;
  const scenario = telemetry.injected_scenario;
  const meta = scenarioMeta[scenario] || scenarioMeta.NORMAL;
  const quality = selectQualitySeam(scenario, blockIndex);

  const torqueRisk = highRisk(telemetry.torque_percent, 70, 100);
  const thermalRisk = highRisk(telemetry.temperature_c, 65, 85);
  const currentRisk = telemetry.operating_state === "OFFLINE"
    ? 0
    : deviationRisk(telemetry.current_amp, 238, .05, .45);
  const voltageRisk = telemetry.operating_state === "OFFLINE"
    ? 0
    : deviationRisk(telemetry.voltage, 28, .05, .35);
  const gasRisk = lowRisk(telemetry.gas_flow, 15, 5);
  const dutyRisk = telemetry.operating_state === "WELDING" ? 1 : 0;

  // 보유 CSV 컬럼만 사용한 설명 가능한 PoC 가중치.
  const operatingLoadScore = 100 * (
    .40 * torqueRisk +
    .25 * thermalRisk +
    .25 * currentRisk +
    .10 * dutyRisk
  );
  const processInstabilityScore = 100 * (
    .35 * currentRisk +
    .25 * voltageRisk +
    .20 * gasRisk +
    .20 * torqueRisk
  );
  const qualityRiskScore = quality.defectRiskProbability * 100;
  const reworkScore = .30 * processInstabilityScore + .70 * qualityRiskScore;
  const isOffline = telemetry.operating_state === "OFFLINE";
  const confirmedAnomaly = Boolean(telemetry.confirmed) && scenario !== "NORMAL";
  const processStage = stepInBlock <= 3 ? "WELDING" : stepInBlock === 4 ? "TRANSFER" : "INSPECTION";
  const workpieceX = processStage === "WELDING" ? -1.1 : processStage === "TRANSFER" ? 1.8 : 4.7;
  const result = isOffline ? "HOLD" : reworkScore >= 60
    ? "REWORK" : reworkScore >= 30 ? "RECHECK" : "PASS";
  const status = isOffline ? "ALARM" : confirmedAnomaly ? "WARNING" : "NORMAL";

  return {
    frameIndex,
    processStep: stepInBlock,
    telemetry,
    quality,
    scenario,
    scenarioLabel: meta.label,
    cause: meta.cause,
    blockIndex,
    workpieceId: `BLK-${String(blockIndex + 1).padStart(3, "0")}`,
    processStage,
    workpieceX,
    workpieceAtRobot: processStage === "WELDING" && !isOffline,
    workpieceAtInspection: processStage === "INSPECTION",
    operatingLoadScore: Math.round(operatingLoadScore * 10) / 10,
    processInstabilityScore: Math.round(processInstabilityScore * 10) / 10,
    qualityRiskScore: Math.round(qualityRiskScore * 10) / 10,
    reworkScore: Math.round(reworkScore * 10) / 10,
    scoreParts: {
      torque: Math.round(torqueRisk * 100),
      thermal: Math.round(thermalRisk * 100),
      current: Math.round(currentRisk * 100),
      duty: Math.round(dutyRisk * 100),
    },
    movementInstability: Math.max(torqueRisk, currentRisk, voltageRisk),
    arcInstability: Math.max(currentRisk, voltageRisk, gasRisk),
    status,
    result,
    isOffline,
    confirmedAnomaly,
  };
}
