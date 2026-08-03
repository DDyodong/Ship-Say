// 최근 위치 이력(history)으로 이동 속도·방향을 계산하고,
// 그 속도를 유지했을 때 각 위험구역(zones)에 몇 초 후 들어가는지 예측합니다.
//
// history: [{ x, y, t }, ...]  t는 ms 단위 타임스탬프, 최근 2개 이상 필요
// zones:   [{ code, name, x, y, w, h }, ...]  트윈 좌표계 기준 사각형 구역
// 반환:    { zoneCode, zoneName, etaSec, predictedX, predictedY, confidence } | null
//
// MVP 대표 시나리오("위험구역 진입 사전 경고")의 핵심 로직입니다.
// 지금은 카메라 좌표→트윈 좌표 매핑이 아직 안 붙어 있어서 시뮬레이션 데이터로
// 검증하고 있지만, 실제 좌표가 들어와도 이 함수는 그대로 재사용됩니다.

export function predictZoneEntry(history, zones, { horizonSec = 8 } = {}) {
  if (!Array.isArray(history) || history.length < 2 || !Array.isArray(zones) || !zones.length) return null;

  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const dt = (last.t - prev.t) / 1000;
  if (dt <= 0) return null;

  const vx = (last.x - prev.x) / dt;
  const vy = (last.y - prev.y) / dt;
  const speed = Math.hypot(vx, vy);
  if (speed < 1) return null; // 정지 상태면 예측할 방향이 없음

  let best = null;
  for (const zone of zones) {
    const eta = timeToEnterRect(last, vx, vy, zone, horizonSec);
    if (eta != null && (best === null || eta < best.etaSec)) {
      best = { zoneCode: zone.code, zoneName: zone.name, etaSec: eta };
    }
  }
  if (!best) return null;

  const predictedX = Math.round(last.x + vx * best.etaSec);
  const predictedY = Math.round(last.y + vy * best.etaSec);

  // 신뢰도: 속도가 빠르고 진입 시점이 임박할수록 높게 잡는 단순 휴리스틱.
  // 실제 배포 시엔 학습된 위험도 모델의 출력으로 교체하면 됩니다.
  const urgency = (horizonSec - best.etaSec) / horizonSec;
  const confidence = Math.min(98, Math.round(55 + Math.min(30, speed / 3) + urgency * 10));

  return { ...best, predictedX, predictedY, confidence };
}

function timeToEnterRect(point, vx, vy, rect, horizonSec) {
  if (pointInRect(point, rect)) return 0;
  const step = 0.1;
  for (let t = step; t <= horizonSec; t += step) {
    const x = point.x + vx * t;
    const y = point.y + vy * t;
    if (pointInRect({ x, y }, rect)) return Math.round(t * 10) / 10;
  }
  return null;
}

function pointInRect(p, rect) {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}