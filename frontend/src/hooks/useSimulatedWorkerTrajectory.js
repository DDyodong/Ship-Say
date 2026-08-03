import { useEffect, useRef, useState } from "react";
import { predictZoneEntry } from "./predictZoneEntry";

// 실제 camera01 좌표 매핑이 붙기 전까지, "작업자가 위험구역으로 다가온다"를
// 재현하는 시뮬레이션 궤적입니다. 좌표 매핑이 완료되면 이 훅 대신 실제 위치
// 이력을 history로 넘겨 predictZoneEntry를 그대로 재사용하면 됩니다.

const ROUTE = [
  { x: 400, y: 400 },
  { x: 330, y: 455 },
  { x: 250, y: 450 },
  { x: 218, y: 430 }, // T-BAR-SHOP 위험구역 진입 지점
  { x: 150, y: 360 },
  { x: 255, y: 300 },
  { x: 390, y: 335 },
  { x: 455, y: 410 },
];
const START = ROUTE[0];
const SPEED = 30; // 트윈 좌표계 기준 px/sec
const TICK_MS = 300;
const WAYPOINT_REACHED_PX = 6;

export default function useSimulatedWorkerTrajectory(zones, { horizonSec = 8 } = {}) {
  const [state, setState] = useState({ x: START.x, y: START.y, prediction: null });
  const posRef = useRef({ ...START });
  const waypointIndexRef = useRef(1);
  const historyRef = useRef([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const target = ROUTE[waypointIndexRef.current];
      const dx = target.x - posRef.current.x;
      const dy = target.y - posRef.current.y;
      const dist = Math.hypot(dx, dy);
      const step = SPEED * (TICK_MS / 1000);

      if (dist <= Math.max(step, WAYPOINT_REACHED_PX)) {
        posRef.current = { ...target };
        waypointIndexRef.current = (waypointIndexRef.current + 1) % ROUTE.length;
      } else {
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
