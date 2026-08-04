import { useEffect, useRef, useState } from "react";

// predictZoneEntry의 예측 결과(ETA)를 받아서 단계별 알림 상태를 만듭니다.
//
//   ETA > WARN_SEC        → 알림 없음 (예측 카드만 조용히 표시)
//   WARN_SEC ≥ ETA > CRIT_SEC → "주의" — 관리자 화면에 배너 표시
//   ETA ≤ CRIT_SEC        → "긴급" — 강하게 깜빡이는 배너 + 확인 필요
//
// firstTriggeredAt으로 "이 알림이 얼마나 지속되고 있는지"도 같이 계산해서,
// 오래 방치된 알림인지 배너에 보여줄 수 있게 했습니다.

const WARN_SEC = 5;
const CRIT_SEC = 2;

export default function useZoneEntryAlert(prediction) {
  const [ackedZone, setAckedZone] = useState(null); // 관리자가 "확인" 누른 구역 코드
  const firstTriggeredAtRef = useRef(null);
  const [sinceMs, setSinceMs] = useState(0);

  const etaSec = prediction?.etaSec ?? null;
  const level = etaSec == null ? "none" : etaSec <= CRIT_SEC ? "critical" : etaSec <= WARN_SEC ? "warning" : "none";

  useEffect(() => {
    if (level === "none") {
      firstTriggeredAtRef.current = null;
      setSinceMs(0);
      return;
    }
    if (!firstTriggeredAtRef.current) firstTriggeredAtRef.current = Date.now();

    const tick = () => setSinceMs(Date.now() - firstTriggeredAtRef.current);
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [level, prediction?.zoneCode]);

  // 위험구역이 바뀌거나 알림이 완전히 해소되면 확인 상태 초기화
  useEffect(() => {
    if (level === "none") setAckedZone(null);
  }, [level]);

  const acknowledge = () => setAckedZone(prediction?.zoneCode ?? null);
  const acknowledged = level !== "none" && ackedZone === prediction?.zoneCode;

  return { level, etaSec, sinceMs, acknowledged, acknowledge, prediction };
}