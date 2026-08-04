import { useEffect, useRef, useState } from "react";

// camera01 파이프라인 서버에 아래 형태의 REST 엔드포인트를 추가했다는 전제입니다.
//   GET /detections/camera01
//   → { worker_id, helmet: "on"|"off", helmet_conf, harness: "on"|"off", harness_conf,
//       welding: "on"|"off"|"undetermined", welding_conf, updated_at }
// 백엔드에 아직 이 엔드포인트가 없다면, 이 훅은 계속 연결 실패 상태(connected=false)를
// 반환하고 화면은 자동으로 데모 데이터로 폴백합니다.

const DEFAULT_URL = "http://43.202.251.220:8000/detections/camera01";

export default function useCameraDetections(url = DEFAULT_URL, intervalMs = 1000) {
  const [detection, setDetection] = useState(null);
  const [connected, setConnected] = useState(false);
  const harnessOffSinceRef = useRef(null); // 안전벨트 OFF 최초 감지 시각(지속시간 계산용)

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function poll() {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.harness === "off") {
          if (!harnessOffSinceRef.current) harnessOffSinceRef.current = Date.now();
        } else {
          harnessOffSinceRef.current = null;
        }

        setDetection({ ...data, harnessOffSince: harnessOffSinceRef.current });
        setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      } finally {
        if (!cancelled) timer = setTimeout(poll, intervalMs);
      }
    }

    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [url, intervalMs]);

  return { detection, connected };
}