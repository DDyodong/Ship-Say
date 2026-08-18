import facilityTags from "../components/digitalTwin/geojeShipyardTags.json";
import { evaluateFactoryWorkers } from "../utils/workerRiskEngine";

// -----------------------------------------------------------------------------
// 설비 프로필 템플릿
// 사진 상의 실제 공장 라벨(1도크·2도크, 조립 1~3공장, 선행의장공장,
// 전처리 및 도장공장, LNGC 도장 및 전처리 공장, 소부재공장,
// 해양제작 1~3공장, 해양 의장공장, 해양플랜트 도장 및 전처리 공장)에
// 대응하도록 총 7개 카테고리로 구성.
// -----------------------------------------------------------------------------
const PROFILE_TEMPLATES = {
  ASSEMBLY: {
    label: "조립·용접 생산설비",
    equipment: [
      ["ROBOT", "자동 용접 로봇", "감속기 베어링", "진동 상승", "장시간 고부하 운전으로 베어링 마모가 진행되었습니다."],
      ["POSITIONER", "블록 포지셔너", "회전축 브레이크", "제동 토크 저하", "브레이크 패드 마모로 정지 위치 편차가 증가했습니다."],
      ["CONVEYOR", "강재 이송 컨베이어", "구동 모터", "모터 온도 상승", "롤러 정렬 불량으로 구동부 부하가 증가했습니다."],
      ["INSPECTOR", "용접 품질 검사기", "레이저 헤드", "광학 신호 감쇠", "보호 윈도 오염으로 측정 신뢰도가 낮아졌습니다."],
    ],
  },
  CUTTING: {
    label: "절단·가공 생산설비",
    equipment: [
      ["CUTTER", "CNC 플라즈마 절단기", "플라즈마 토치", "아크 전압 불안정", "노즐 마모로 절단 아크가 불규칙해졌습니다."],
      ["CONVEYOR", "강판 이송 테이블", "구동 롤러", "회전 편차", "롤러 축 편심으로 이송 속도 편차가 발생했습니다."],
      ["FAN", "집진 배기 설비", "임펠러 베어링", "진동 상승", "분진 축적으로 회전체 밸런스가 저하되었습니다."],
      ["PUMP", "절삭 냉각수 펌프", "메커니컬 씰", "압력 누설", "씰 마모로 토출 압력이 기준 이하로 저하되었습니다."],
    ],
  },
  SMALLPART: {
    label: "소부재 가공설비",
    equipment: [
      ["CUTTER", "소부재 정밀 절단기", "절단 노즐", "절단폭 편차", "노즐 마모로 소부재 절단 치수 편차가 발생했습니다."],
      ["ROBOT", "소부재 마킹 로봇", "마킹 헤드", "위치 인식 오류", "카메라 렌즈 오염으로 마킹 좌표 인식률이 저하되었습니다."],
      ["CONVEYOR", "소부재 이송 컨베이어", "구동 모터", "속도 편차", "체인 장력 저하로 이송 속도가 불안정합니다."],
      ["FAN", "소부재 집진 설비", "임펠러 베어링", "진동 상승", "분진 축적으로 회전체 밸런스가 저하되었습니다."],
    ],
  },
  PAINT: {
    label: "도장·전처리 생산설비",
    equipment: [
      ["PUMP", "고압 도료 공급 펌프", "메커니컬 씰", "토출 압력 저하", "씰 마모로 도료 공급 압력이 불안정합니다."],
      ["FAN", "VOC 배기 팬", "구동 베어링", "진동 위험", "베어링 윤활 부족으로 진동값이 상승했습니다."],
      ["FAN", "도장부스 급기 팬", "팬 블레이드", "풍량 저하", "블레이드 표면 도료 부착으로 풍량이 감소했습니다."],
      ["PUMP", "세정액 순환 펌프", "임펠러", "유량 저하", "이물질 유입으로 임펠러 효율이 저하되었습니다."],
      ["ROBOT", "자동 도장 로봇 A", "분사 노즐", "분사 패턴 편차", "노즐 부착물로 분사 폭이 설정값에서 벗어났습니다."],
      ["ROBOT", "자동 도장 로봇 B", "도료 공급 호스", "공급 압력 편차", "호스 굴곡 구간에서 도료 공급 저항이 증가했습니다."],
    ],
  },
  DOCK: {
    label: "도크·중량물 취급설비",
    equipment: [
      ["GOLIATH", "골리앗 크레인", "권상 브레이크", "제동 응답 지연", "브레이크 라이닝 마모로 제동 시간이 증가했습니다."],
      ["PUMP", "도크 배수 펌프", "축 베어링", "온도 상승", "축 정렬 편차로 베어링 온도가 상승했습니다."],
      ["TRANSPORTER", "중량물 이송 대차", "휠 구동부", "전류 과부하", "레일 이물질로 주행 저항이 증가했습니다."],
    ],
  },
  OUTFITTING: {
    label: "의장·배관 생산설비",
    equipment: [
      ["BENDER", "파이프 벤딩 머신", "유압 실린더", "압력 유지 불량", "실린더 내부 누유로 설정 압력을 유지하지 못합니다."],
      ["PUMP", "수압 시험 펌프", "체크 밸브", "역류 감지", "밸브 시트 손상으로 미세 역류가 발생했습니다."],
      ["ROBOT", "배관 자동 용접기", "토치 케이블", "송급 저항 증가", "케이블 굴곡 누적으로 와이어 송급 부하가 증가했습니다."],
      ["FAN", "국소 배기 장치", "필터 모듈", "차압 상승", "필터 포화로 배기 성능이 저하되었습니다."],
    ],
  },
  OFFSHORE: {
    label: "해양구조물 제작·의장설비",
    equipment: [
      ["BLOCK_CRANE", "대형 블록 탑재 크레인", "권상 와이어로프", "와이어 소선 손상", "반복 하중으로 와이어로프 소선 파단이 감지되었습니다."],
      ["ROBOT", "대형 정반 자동 용접기", "용접 토치", "아크 불안정", "토치 팁 마모로 용접 아크가 불규칙해졌습니다."],
      ["POSITIONER", "해양구조물 회전 포지셔너", "회전축 베어링", "회전 저항 증가", "베어링 윤활 부족으로 회전 구동 부하가 증가했습니다."],
      ["CUTTER", "후육 강재 절단기", "플라즈마 토치", "절단면 품질 저하", "노즐 마모로 후육 강재 절단면이 거칠어졌습니다."],
    ],
  },
};

// 설비별 배치·애니메이션 표현 오버라이드.
const EQUIPMENT_RENDER_OVERRIDES = {
  "자동 용접 로봇": { lineSync: "ASSEMBLY", lineStationX: -1.1 },
  "강재 이송 컨베이어": {
    lineSync: "ASSEMBLY",
    conveyorLength: 16,
    selectionRingScale: [6.5, .85, 1],
    labelPosition: [2.9, 1.35, -1.2],
    workpieceStyle: "ASSEMBLY_BLOCK",
    operatingState: "RUNNING",
  },
  "강판 이송 테이블": { conveyorLength: 13, selectionRingScale: [5.3, .85, 1], workpieceStyle: "STEEL_PLATE", operatingState: "RUNNING" },
  "소부재 정밀 절단기": { lineSync: "SMALLPART", lineStationX: -4.4 },
  "소부재 마킹 로봇": { lineSync: "SMALLPART", lineStationX: 0, toolType: "MARKER", operatingState: "RUNNING" },
  "소부재 이송 컨베이어": { lineSync: "SMALLPART", conveyorLength: 14, selectionRingScale: [5.7, .85, 1], workpieceStyle: "SMALL_PART", operatingState: "RUNNING" },
  "소부재 집진 설비": { lineSync: "SMALLPART", lineStationX: -4.4, operatingState: "RUNNING" },
  "VOC 배기 팬": { fixedLayout: true },
  "도장부스 급기 팬": { fixedLayout: true },
  "자동 도장 로봇 A": { fixedLayout: true, toolType: "PAINTER", operatingState: "RUNNING" },
  "자동 도장 로봇 B": { fixedLayout: true, toolType: "PAINTER", operatingState: "RUNNING" },
  "파이프 벤딩 머신": { fixedLayout: true },
  "수압 시험 펌프": { fixedLayout: true },
  "배관 자동 용접기": { fixedLayout: true },
  "국소 배기 장치": { fixedLayout: true },
  "대형 블록 탑재 크레인": {
    labelPosition: [0, 8.35, 0],
    selectionRingScale: [10.5, 1.5, 1],
  },
  "대형 정반 자동 용접기": { fixedLayout: true, lineSync: "OFFSHORE", operatingState: "RUNNING" },
  "해양구조물 회전 포지셔너": { fixedLayout: true, lineSync: "OFFSHORE", operatingState: "RUNNING" },
  "후육 강재 절단기": { fixedLayout: true },
  "골리앗 크레인": {
    labelPosition: [0, 8.35, 0],
    selectionRingScale: [10.5, 1.5, 1],
  },
  // 대형 블록 크레인은 도크급 문형 크레인 형상을 재사용해 공장 폭 전체를 가로지르게 한다.
};

const WORKER_TASKS = {
  ASSEMBLY: ["용접 비드 검사", "블록 위치 정렬", "강재 이송 감시", "용접 조건 확인", "품질 육안검사", "안전 순찰"],
  CUTTING: ["절단 노즐 점검", "강판 위치 정렬", "집진설비 확인", "절단 품질 검사", "소재 반입", "안전 순찰"],
  SMALLPART: ["소부재 치수 검사", "마킹 좌표 확인", "이송라인 점검", "집진설비 확인", "소부재 분류", "안전 순찰"],
  PAINT: ["도료 압력 확인", "VOC 농도 측정", "부스 급기 점검", "도막 품질 검사", "세정액 보충", "안전 순찰"],
  DOCK: ["권상 작업 신호", "하중 결속 확인", "크레인 주행 감시", "도크 배수 점검", "이송 대차 유도", "안전 순찰"],
  OUTFITTING: ["배관 치수 확인", "수압 시험", "배관 용접", "배기설비 점검", "자재 운반", "안전 순찰"],
  OFFSHORE: ["블록 탑재 신호", "와이어로프 점검", "정반 용접 감시", "구조물 치수 검사", "회전 포지셔너 조작", "안전 순찰"],
};

// 사진 속 실제 공장 라벨을 우선순위대로 매칭.
// 더 구체적인 이름(소부재/해양제작/LNGC 등)을 먼저 검사해
// 일반 키워드(도장·의장 등)에 앞서 정확히 분류되도록 함.
function classify(name) {
  if (name.includes("소부재")) return "SMALLPART";
  if (name.includes("해양제작")) return "OFFSHORE";
  if (name.includes("도크") || name.includes("크레인")) return "DOCK";
  if (name.includes("도장") || name.includes("전처리")) return "PAINT";
  if (name.includes("의장")) return "OUTFITTING";
  if (name.includes("절단")) return "CUTTING";
  return "ASSEMBLY";
}

function sensorSet(kind, alarm, seed, toolType) {
  if (kind === "ROBOT" && toolType === "PAINTER") return [
    ["축 진동", alarm ? 8.7 : 2.1, "mm/s", "≤ 4.5"],
    ["분사 압력", alarm ? 3.1 : 5.2, "bar", "4.8–5.6"],
    ["도료 유량", alarm ? 68 : 93, "%", "≥ 85"],
  ].map(([label, value, unit, normalRange], index) => ({ label, value, unit, normalRange, alarm: alarm && index < 2 }));
  const common = {
    ROBOT: [["진동", alarm ? 8.7 : 2.1, "mm/s", "≤ 4.5"], ["모터 온도", alarm ? 82.4 : 54.2, "°C", "≤ 70"], ["용접 전류", 248 + seed, "A", "220–280"]],
    INSPECTOR: [["용접 비드 폭", alarm ? 5.1 : 7.4, "mm", "6.5–8.5"], ["언더컷 깊이", alarm ? 1.2 : 0.18, "mm", "≤ 0.5"], ["용접 결함 확률", alarm ? 78 : 6, "%", "≤ 15"]],
    POSITIONER: [["유압", alarm ? 118 : 146, "bar", "135–160"], ["회전 편차", alarm ? 2.8 : 0.4, "°", "≤ 1.0"], ["오일 온도", 48 + seed % 7, "°C", "≤ 65"]],
    BENDER: [["유압", alarm ? 116 : 148, "bar", "135–160"], ["벤딩 각도 편차", alarm ? 2.4 : 0.35, "°", "≤ 1.0"], ["오일 온도", alarm ? 72 : 49, "°C", "≤ 65"]],
    CONVEYOR: [["구동 전류", alarm ? 38.6 : 24.2, "A", "≤ 30"], ["롤러 속도", alarm ? 0.71 : 0.84, "m/s", "0.8–0.9"], ["모터 온도", alarm ? 79.1 : 51.3, "°C", "≤ 70"]],
    TRANSPORTER: [["주행 전류", alarm ? 41.8 : 25.6, "A", "≤ 32"], ["주행 속도", alarm ? 0.42 : 0.58, "m/s", "0.5–0.65"], ["휠 모터 온도", alarm ? 78.4 : 49.8, "°C", "≤ 70"]],
    CUTTER: [["아크 전압", alarm ? 176 : 142, "V", "135–150"], ["가스 압력", 5.8, "bar", "5.5–6.2"], ["노즐 온도", alarm ? 328 : 246, "°C", "≤ 290"]],
    FAN: [["베어링 진동", alarm ? 9.2 : 2.8, "mm/s", "≤ 4.5"], ["풍량", alarm ? 68 : 94, "%", "≥ 85"], ["모터 전류", alarm ? 42.1 : 31.4, "A", "≤ 38"]],
    PUMP: [["토출 압력", alarm ? 3.1 : 5.4, "bar", "4.8–5.8"], ["유량", alarm ? 62 : 91, "%", "≥ 85"], ["씰 온도", alarm ? 76 : 43, "°C", "≤ 60"]],
    CRANE: [["브레이크 응답", alarm ? 1.84 : 0.72, "s", "≤ 1.0"], ["권상 하중", 68 + seed % 12, "%", "≤ 90"], ["감속기 진동", alarm ? 8.4 : 2.5, "mm/s", "≤ 4.5"]],
    BLOCK_CRANE: [["권상 장력", alarm ? 108 : 72, "%", "≤ 90"], ["주행 편차", alarm ? 2.1 : 0.35, "mm", "≤ 1.0"], ["감속기 진동", alarm ? 8.4 : 2.5, "mm/s", "≤ 4.5"]],
    GOLIATH: [["브레이크 응답", alarm ? 1.84 : 0.72, "s", "≤ 1.0"], ["권상 하중", 68 + seed % 12, "%", "≤ 90"], ["주행 감속기 진동", alarm ? 8.4 : 2.5, "mm/s", "≤ 4.5"]],
  };
  return common[kind].map(([label, value, unit, normalRange], index) => ({ label, value, unit, normalRange, alarm: alarm && index < 2 }));
}

const rawFactoryCatalog = facilityTags
  .filter((facility) => facility.status === "confirmed")
  .map((facility) => {
    const code = `TAG-${facility.id}`;
    const profileKey = classify(facility.name);
    const profile = PROFILE_TEMPLATES[profileKey];
    const faultIndex = facility.id % profile.equipment.length;
    const equipment = profile.equipment.map(([kind, name, part, symptom, cause], index) => {
      const alarm = index === faultIndex;
      return {
        assetCode: `${profileKey.slice(0, 3)}-${String(facility.id).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
        name,
        kind,
        ...(EQUIPMENT_RENDER_OVERRIDES[name] || {}),
        status: alarm ? "ALARM" : index === (faultIndex + 1) % profile.equipment.length ? "WARNING" : "NORMAL",
        operatingState: EQUIPMENT_RENDER_OVERRIDES[name]?.operatingState || (index % 2 ? "STANDBY" : "RUNNING"),
        utilization: 62 + ((facility.id * 11 + index * 9) % 34),
        fault: alarm ? {
          part,
          symptom,
          cause,
          severity: "HIGH",
          detectedAt: "13:42:18",
          confidence: 94 + (facility.id % 5),
          action: `${part} 정밀점검 후 예비품 교체, 정비 완료 전 부하 60% 제한 운전`,
        } : null,
        sensors: sensorSet(kind, alarm, facility.id + index, EQUIPMENT_RENDER_OVERRIDES[name]?.toolType),
      };
    });
    const workers = WORKER_TASKS[profileKey].map((task, index) => {
      const assignedAsset = equipment[index % equipment.length];
      const exposed = index === 0;
      return {
        workerId: `W-${String(facility.id * 20 + index + 1).padStart(3, "0")}`,
        name: ["김도윤", "이서준", "박현우", "최민석", "정우진", "한지훈"][index],
        role: index === 5 ? "안전관리자" : "현장 작업자",
        task,
        assignedAssetCode: exposed ? equipment[faultIndex].assetCode : assignedAsset.assetCode,
        assignedAssetName: exposed ? equipment[faultIndex].name : assignedAsset.name,
        permitId: `PTW-${String(facility.id).padStart(2, "0")}-${String(index + 41).padStart(3, "0")}`,
        permitType: index % 3 === 0 ? "고소·화기" : index % 3 === 1 ? "중량물·인양" : "일반 정비",
        permitStatus: index === 4 ? "EXPIRING" : "VALID",
        permitExpiresAt: index === 4 ? "14:10" : "18:00",
        ppe: { helmet: true, harness: !exposed, vest: true },
        riskLevel: exposed ? "HIGH" : index === 4 ? "MEDIUM" : "LOW",
        riskReason: exposed ? `${equipment[faultIndex].name} 이상 부품 반경 4.6m에서 작업 중` : index === 4 ? "작업허가서 만료 28분 전" : "정상 작업 구역",
        distanceToFault: exposed ? 4.6 : 18 + index * 7.4,
        shift: "주간 A조",
        cameraId: `CAM-${String(facility.id).padStart(2, "0")}-${String((index % 3) + 1).padStart(2, "0")}`,
        locationSource: index % 2 ? "UWB TAG" : "WORKER APP GPS",
        lastSeenAt: `13:42:${String(14 + index).padStart(2, "0")}`,
        qualification: index % 3 === 0 ? "화기작업·고소작업" : index % 3 === 1 ? "인양 신호수" : "설비 점검",
        qualificationValid: index !== 3,
        riskScore: exposed ? 94 + (facility.id % 4) : index === 4 ? 63 : 12 + index * 4,
        evacuationEta: exposed ? 42 : 0,
        recommendedAction: exposed ? "즉시 작업 중지 · 동측 집결지 대피" : index === 4 ? "허가 연장 승인 전 신규 작업 차단" : "작업 지속 모니터링",
      };
    });
    return {
      code,
      name: facility.name,
      lat: facility.lat,
      lng: facility.lng,
      profileKey,
      profileLabel: profile.label,
      equipment,
      workers,
      openFaults: equipment.filter((asset) => asset.fault).length,
      warningCount: equipment.filter((asset) => asset.status === "WARNING").length,
      exposedWorkers: workers.filter((worker) => worker.riskLevel === "HIGH").length,
      safetyState: {
        incidentId: `INC-${new Date().getFullYear()}-${String(facility.id).padStart(4, "0")}`,
        isolationTarget: equipment[faultIndex].assetCode,
        dangerRadius: 8,
        musterPoint: "동측 비상 집결지 A",
        productionLinesAffected: 1,
        productionLinesTotal: equipment.length,
        estimatedDowntimeWithoutAction: 4.8,
        estimatedDowntimeWithIsolation: 1.2,
        evidenceSources: ["CCTV PPE AI", "UWB/GPS 위치", "작업허가서", "설비 센서"],
      },
    };
  });

export const factoryCatalog = rawFactoryCatalog.map(evaluateFactoryWorkers);

export function getFactoryDetail(code) {
  return factoryCatalog.find((factory) => factory.code === code) || factoryCatalog[0];
}
