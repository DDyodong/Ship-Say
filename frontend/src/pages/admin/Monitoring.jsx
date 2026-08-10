import React, { useCallback, useState } from "react";
import { Settings, Siren } from "lucide-react";
import { SectionHead } from "../../components/common";
<<<<<<< HEAD
import LiveHlsPlayer from "../../components/monitoring/LiveHlsPlayer";
=======
import HlsPlayer from "../../components/common/HlsPlayer";

const STREAM_BASE = import.meta.env.VITE_STREAM_BASE_URL
  || "https://df47xszv4nn0z.cloudfront.net";

const CAMERA_STREAMS = ["01", "02", "03", "04"].map(id => ({
  id,
  src: `${STREAM_BASE}/processed-camera${id}/index.m3u8`,
}));
>>>>>>> 3dd3b97 (Yolo 엔드포인트 추가)

// 카메라 파이프라인 서버(CloudFront)에 올라오는 4개 실시간 HLS 스트림.
// .env에 VITE_CAMERAxx_HLS_URL이 있으면 그 값을, 없으면 알려진 배포 경로를 그대로 사용합니다
// (client.js의 프로덕션 API_BASE 폴백과 동일한 방식 — CI 시크릿 없이도 항상 정상 동작).
const CAMERA_STREAM_BASE = "https://df47xszv4nn0z.cloudfront.net";
const LIVE_STREAMS = {
  0: import.meta.env.VITE_CAMERA01_HLS_URL || `${CAMERA_STREAM_BASE}/processed-camera01/index.m3u8`,
  1: import.meta.env.VITE_CAMERA02_HLS_URL || `${CAMERA_STREAM_BASE}/processed-camera02/index.m3u8`,
  2: import.meta.env.VITE_CAMERA03_HLS_URL || `${CAMERA_STREAM_BASE}/processed-camera03/index.m3u8`,
  3: import.meta.env.VITE_CAMERA04_HLS_URL || `${CAMERA_STREAM_BASE}/processed-camera04/index.m3u8`,
};

function Monitoring({ notify }) {
  const cameras = ["B-07 상부 작업장", "C-03 배관 구역", "A-12 도장 구역", "D-02 자재 적치장"];
  const [liveFailed, setLiveFailed] = useState({});

  const handleLiveError = useCallback((index) => {
    setLiveFailed((prev) => (prev[index] ? prev : { ...prev, [index]: true }));
  }, []);

  return (
    <>
      <SectionHead
        eyebrow="AI VISION CONTROL"
        title="CCTV 실시간 감시"
        desc="CCTV 영상에서 PPE 미착용과 위험구역 침입을 감지합니다."
        action={<button className="outline-btn"><Settings />관제 설정</button>}
      />
<<<<<<< HEAD
      <div className="monitor-grid">
        {cameras.map((name, index) => {
          const liveSrc = LIVE_STREAMS[index];
          const showLive = Boolean(liveSrc) && !liveFailed[index];
          return (
          <div className="camera-card" key={name}>
            <div className={`camera-feed cam${index + 1}`}>
              {showLive && (
                <LiveHlsPlayer
                  src={liveSrc}
                  className="camera-feed-video"
                  onError={() => handleLiveError(index)}
                />
              )}
              <div className="camera-head">
                <span><i />LIVE · CAM-{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="camera-name">
                <b>{name}</b>
                <span>정상 모니터링</span>
              </div>
            </div>
            <button
              className="alert-action"
              onClick={() => notify(`${name} 현장 반장에게 경고를 전송했습니다.`)}
            >
              <Siren />현장 경고 전송
            </button>
          </div>
          );
        })}
=======

      <div className="monitor-grid">
        {CAMERA_STREAMS.map(camera => (
          <HlsPlayer
            key={camera.id}
            title={`CAM-${camera.id}`}
            src={camera.src}
          />
        ))}
      </div>

      <div className="ppe-scope-banner">
        <HardHat />
        <div>
          <b>YOLO 탐지 대상</b>
          <span>Helmet · Harness · Welding mask</span>
        </div>
        <div>
          <b>작업자 직접 확인</b>
          <span>안전화 · 안전복</span>
        </div>
>>>>>>> 3dd3b97 (Yolo 엔드포인트 추가)
      </div>
    </>
  );
}

export default Monitoring;
