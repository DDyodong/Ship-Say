import { useEffect, useRef, useState } from "react";
import { predictZoneEntry } from "./predictZoneEntry";

// Road-centre coordinates in the map's 1000 x 560 SVG viewBox.
// Dead ends are retraced so changing sectors never creates a shortcut across
// a building, storage yard, dock, or the sea.
const WEST_PERIMETER_ROAD = [
  { x: 292, y: 433 },
  { x: 252, y: 420 },
  { x: 210, y: 400 },
  { x: 165, y: 377 },
  { x: 120, y: 355 },
  { x: 83, y: 330 },
  { x: 55, y: 298 },
  { x: 52, y: 270 },
  { x: 66, y: 242 },
  { x: 78, y: 214 },
  { x: 95, y: 205 },
];

const NORTH_FACTORY_ROAD = [
  { x: 95, y: 205 },
  { x: 135, y: 217 },
  { x: 180, y: 214 },
  { x: 215, y: 200 },
  { x: 255, y: 188 },
  { x: 295, y: 188 },
];

// Main internal service road running between the fabrication buildings and
// across the assembly/crane yards. These points follow the visible grey lanes.
const CROSS_YARD_ROAD = [
  { x: 295, y: 188 },
  { x: 315, y: 195 },
  { x: 335, y: 207 },
  { x: 355, y: 220 },
  { x: 375, y: 235 },
  { x: 395, y: 250 },
  { x: 420, y: 260 },
  { x: 445, y: 255 },
  { x: 470, y: 245 },
  { x: 495, y: 235 },
  { x: 520, y: 225 },
  { x: 545, y: 218 },
  { x: 570, y: 214 },
  { x: 595, y: 215 },
  { x: 620, y: 220 },
  { x: 645, y: 228 },
  { x: 670, y: 235 },
  { x: 695, y: 242 },
  { x: 720, y: 247 },
  { x: 745, y: 250 },
  { x: 770, y: 252 },
  { x: 795, y: 254 },
  { x: 820, y: 257 },
  { x: 841, y: 260 },
  { x: 861, y: 259 },
];

const SOUTH_DOCK_ROAD = [
  { x: 292, y: 433 },
  { x: 323, y: 425 },
  { x: 353, y: 410 },
  { x: 371, y: 387 },
  { x: 389, y: 366 },
  { x: 419, y: 357 },
  { x: 449, y: 351 },
  { x: 478, y: 345 },
  { x: 508, y: 339 },
  { x: 538, y: 333 },
  { x: 568, y: 327 },
  { x: 610, y: 321 },
  { x: 646, y: 312 },
  { x: 682, y: 303 },
  { x: 718, y: 294 },
  { x: 754, y: 286 },
  { x: 790, y: 277 },
  { x: 826, y: 268 },
  { x: 861, y: 259 },
];

const retrace = (road) => road.slice(0, -1).reverse();

export const YARD_PATROL_ROUTE = [
  // Begin in the inner factory so a fresh dashboard immediately shows the
  // worker traversing the whole yard instead of lingering near the south gate.
  ...CROSS_YARD_ROAD,
  ...retrace(SOUTH_DOCK_ROAD),
  ...WEST_PERIMETER_ROAD.slice(1),
  ...NORTH_FACTORY_ROAD.slice(1),
];

const START = YARD_PATROL_ROUTE[0];
const SPEED = 5; // visible but still noticeably slower than the old simulation
const TICK_MS = 80;

export default function useSimulatedWorkerTrajectory(zones, { horizonSec = 8 } = {}) {
  const [state, setState] = useState({
    x: START.x,
    y: START.y,
    prediction: null,
    route: YARD_PATROL_ROUTE,
  });
  const posRef = useRef({ ...START });
  const waypointRef = useRef(1);
  const historyRef = useRef([]);

  useEffect(() => {
    posRef.current = { ...START };
    waypointRef.current = 1;
    historyRef.current = [];
    setState({
      x: START.x,
      y: START.y,
      prediction: null,
      route: YARD_PATROL_ROUTE,
    });

    const interval = setInterval(() => {
      const waypointIndex = waypointRef.current % YARD_PATROL_ROUTE.length;
      const target = YARD_PATROL_ROUTE[waypointIndex];
      const dx = target.x - posRef.current.x;
      const dy = target.y - posRef.current.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 1.5) {
        posRef.current = { ...target };
        waypointRef.current = (waypointRef.current + 1) % YARD_PATROL_ROUTE.length;
      } else {
        const step = Math.min(dist, SPEED * (TICK_MS / 1000));
        posRef.current = {
          x: posRef.current.x + (dx / dist) * step,
          y: posRef.current.y + (dy / dist) * step,
        };
      }

      const now = Date.now();
      historyRef.current = [...historyRef.current, { ...posRef.current, t: now }].slice(-6);

      const prediction = predictZoneEntry(historyRef.current, zones, { horizonSec });
      setState({
        x: posRef.current.x,
        y: posRef.current.y,
        prediction,
        route: YARD_PATROL_ROUTE,
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [zones, horizonSec]);

  return state;
}
