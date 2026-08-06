import React, { lazy, Suspense, useState } from "react";
import SafetyScenarioTwin from "./SafetyScenarioTwin";

const FactoryDetailTwin = lazy(() => import("./FactoryDetailTwin"));

function DigitalTwin({ notify }) {
  const [selectedFacilityCode, setSelectedFacilityCode] = useState(null);

  if (selectedFacilityCode) {
    return <Suspense fallback={<div className="twin-theme-page flex min-h-[620px] items-center justify-center bg-[#050b12] text-xs font-bold text-cyan-300">3D 설비 디지털 트윈을 불러오는 중입니다...</div>}>
      <FactoryDetailTwin
        facilityCode={selectedFacilityCode}
        onBack={() => setSelectedFacilityCode(null)}
        notify={notify}
      />
    </Suspense>;
  }

  return <SafetyScenarioTwin notify={notify} onOpenFactory={setSelectedFacilityCode}/>;
}

export default DigitalTwin;
