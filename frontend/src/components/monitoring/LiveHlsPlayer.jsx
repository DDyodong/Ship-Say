import React, { useEffect, useRef } from "react";
import Hls from "hls.js";

// 실제 카메라 서버(HLS)를 <video>에 재생합니다.
// 스트림 로드에 실패하면 onError를 호출해 부모가 데모 화면 등으로 폴백할 수 있게 합니다.
function LiveHlsPlayer({ src, className, onError, onReady }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    let hls;

    if (Hls.isSupported()) {
      hls = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal) onError?.(data);
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari/iOS는 HLS를 네이티브로 재생
      video.src = src;
      video.addEventListener("error", () => onError?.(video.error), { once: true });
    } else {
      onError?.(new Error("HLS unsupported"));
    }

    return () => {
      hls?.destroy();
    };
  }, [src, onError]);

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay
      muted
      playsInline
      onPlaying={onReady}
    />
  );
}

export default LiveHlsPlayer;
