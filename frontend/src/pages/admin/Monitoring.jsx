import React from "react";
import { Settings, Siren } from "lucide-react";
import { SectionHead } from "../../components/common";

function Monitoring({notify}) {
  const cameras = ["B-07 상부 작업장", "C-03 배관 구역", "A-12 도장 구역", "D-02 자재 적치장"];
  return <>
    <SectionHead eyebrow="AI VISION CONTROL" title="CCTV 실시간 감시"
      desc="CCTV 영상에서 PPE 미착용과 위험구역 침입을 감지합니다."
      action={<button className="outline-btn"><Settings/>관제 설정</button>}/>
    <div className="monitor-grid">{cameras.map((name,index)=><div className="camera-card" key={name}>
      <div className={`camera-feed cam${index+1}`}>
        <div className="camera-head"><span><i/>LIVE · CAM-{[12,8,3,21][index]}</span><small>10:45:2{index}</small></div>
        {index===0&&<><div className="detect-box person"><span>PERSON 98%</span></div><div className="detect-box helmet"><span>NO HARNESS 94%</span></div></>}
        <div className="camera-name"><b>{name}</b><span>{index===0?"위험 이벤트 감지":"정상 모니터링"}</span></div>
      </div>
      {index===0&&<button className="alert-action" onClick={()=>notify("현장 반장에게 경고를 전송했습니다.")}><Siren/>현장 경고 전송</button>}
    </div>)}</div>
  </>;
}

export default Monitoring;
