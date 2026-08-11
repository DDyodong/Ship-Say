import React, { useCallback, useState } from "react";
import { Siren, Video } from "lucide-react";
import { SectionHead } from "../../components/common";
import LiveHlsPlayer from "../../components/monitoring/LiveHlsPlayer";

// 카메라 파이프라인 서버(CloudFront)에 올라오는 4개 실시간 HLS 스트림.
// .env에 VITE_CAMERAxx_HLS_URL이 있으면 그 값을, 없으면 알려진 배포 경로를 그대로 사용합니다.
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
  const [liveReady, setLiveReady] = useState({});

  const handleLiveError = useCallback((index) => {
    setLiveFailed((prev) => (prev[index] ? prev : { ...prev, [index]: true }));
  }, []);

  return (
    <>
      <SectionHead
        eyebrow="AI VISION CONTROL"
        title="CCTV 실시간 감시"
        desc="CCTV 영상에서 PPE 미착용과 위험구역 침입을 감지합니다."
      />
      <div className="monitor-grid">
        {cameras.map((name, index) => {
          const liveSrc = LIVE_STREAMS[index];
          const showLive = Boolean(liveSrc) && !liveFailed[index];
          const isReady = Boolean(liveReady[index]) && showLive;
          return (
            <div className="camera-card" key={name}>
              <div className={`camera-feed cam${index + 1}`}>
                {!isReady && (
                  <div className="camera-preparing" role="status">
                    <span><Video /></span>
                    <b>영상을 준비 중입니다</b>
                    <small>카메라 연결을 확인하고 있습니다.</small>
                  </div>
                )}
                {showLive && (
                  <LiveHlsPlayer
                    src={liveSrc}
                    className={`camera-feed-video${isReady ? " is-ready" : ""}`}
                    onError={() => handleLiveError(index)}
                    onReady={() => setLiveReady((prev) => (prev[index] ? prev : { ...prev, [index]: true }))}
                  />
                )}
                <div className="camera-head">
                  <span className={isReady ? "" : "is-preparing"}><i />{isReady ? "LIVE" : "STANDBY"} · CAM-{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="camera-name">
                  <b>{name}</b>
                  <span>{isReady ? "정상 모니터링" : "영상 연결 준비 중"}</span>
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
      </div>
    </>
  );
}

export default Monitoring;
