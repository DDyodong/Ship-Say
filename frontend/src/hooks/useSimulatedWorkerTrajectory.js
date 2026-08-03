import { useEffect, useRef, useState } from "react";
import { predictZoneEntry } from "./predictZoneEntry";

// 실제 camera01 좌표 매핑이 붙기 전까지, "작업자가 위험구역으로 다가온다"를
// 재현하는 시뮬레이션 궤적입니다. 좌표 매핑이 완료되면 이 훅 대신 실제 위치
// 이력을 history로 넘겨 predictZoneEntry를 그대로 재사용하면 됩니다.

const START = { x: 400, y: 400 };
const APPROACH_TARGET = { x: 225, y: 400 }; // 위험구역(T-BAR-SHOP) 경계 부근
const SPEED = 30; // 트윈 좌표계 기준 px/sec
const TICK_MS = 300;

export default function useSimulatedWorkerTrajectory(zones, { horizonSec = 8 } = {}) {
  const [state, setState] = useState({ x: START.x, y: START.y, prediction: null });
  const posRef = useRef({ ...START });
  const historyRef = useRef([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const dx = APPROACH_TARGET.x - posRef.current.x;
      const dy = APPROACH_TARGET.y - posRef.current.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 8) {
        posRef.current = { ...START }; // 도착하면 처음 위치로 리셋해 계속 반복
      } else {
        const step = SPEED * (TICK_MS / 1000);
        posRef.current = {
          x: posRef.current.x + (dx / dist) * step,
          y: posRef.current.y + (dy / dist) * step,
        };
      }

      const now = Date.now();
      historyRef.current = [...historyRef.current, { ...posRef.current, t: now }].slice(-6);

      const prediction = predictZoneEntry(historyRef.current, zones, { horizonSec });
      setState({ x: posRef.current.x, y: posRef.current.y, prediction });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [zones, horizonSec]);

  return state;
}