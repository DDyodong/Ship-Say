import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

function HlsPlayer({ src, title }) {
  const videoRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    setFailed(false);

    if (Hls.isSupported()) {
      const hls = new Hls({
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 5,
      });

      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setFailed(true);
      });

      return () => hls.destroy();
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return () => video.removeAttribute("src");
    }

    setFailed(true);
    return undefined;
  }, [src]);

  return (
    <div className="camera-card">
      <div className="camera-feed live-camera-feed">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          controls
          aria-label={`${title} live stream`}
        />
        <div className="camera-head">
          <span><i /> LIVE</span>
          <span>{title}</span>
        </div>
        {failed && (
          <div className="camera-stream-error">
            스트림을 불러오지 못했습니다.
          </div>
        )}
      </div>
    </div>
  );
}

export default HlsPlayer;
