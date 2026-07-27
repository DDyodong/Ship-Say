package com.example.safetyai.digitaltwin.service;

import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.Alarm;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.Asset;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.AxisAngles;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.Facility;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.HistoryPoint;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.ProcessStep;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.RobotTelemetry;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.ScenarioRequest;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.ScenarioResult;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.ScenarioState;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.ShopSnapshot;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.YardSnapshot;
import com.example.safetyai.digitaltwin.repository.DigitalTwinRepository;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DigitalTwinService {
    private static final String T_BAR_SHOP = "T-BAR-SHOP";
    private final DigitalTwinRepository repository;
    private final AtomicLong lastHistoryWrite = new AtomicLong(0);

    public DigitalTwinService(DigitalTwinRepository repository) {
        this.repository = repository;
    }

    public YardSnapshot yardSnapshot() {
        List<Facility> facilities = new ArrayList<>(repository.findFacilities());
        repository.findFacility(T_BAR_SHOP).ifPresent(tbar -> {
            String scenario = repository.findActiveScenario(tbar.id()).orElse(ScenarioState.normal()).type();
            if (!"NORMAL".equals(scenario)) {
                for (int i = 0; i < facilities.size(); i++) {
                    Facility f = facilities.get(i);
                    if (f.id() == tbar.id()) {
                        facilities.set(i, new Facility(f.id(), f.code(), f.name(), f.type(), "warning",
                            scenario.equals("COMMUNICATION_LOSS") ? "critical" : "high",
                            f.progressPercent(), f.mapX(), f.mapY(), f.mapWidth(), f.mapHeight()));
                    }
                }
            }
        });
        int warnings = (int) facilities.stream()
            .filter(f -> !"low".equalsIgnoreCase(f.riskLevel())).count();
        int running = (int) facilities.stream()
            .filter(f -> "running".equalsIgnoreCase(f.status())).count();
        return new YardSnapshot("GEOJE-YARD", "거제 스마트 조선소", LocalDateTime.now(),
            running, warnings, repository.countOpenAlarms(), facilities);
    }

    public ShopSnapshot shopSnapshot(String facilityCode) {
        Facility facility = requireFacility(facilityCode);
        ScenarioState scenario = repository.findActiveScenario(facility.id()).orElse(ScenarioState.normal());
        List<Asset> assets = repository.findAssets(facility.id());
        List<Asset> robotAssets = assets.stream()
            .filter(a -> "WELDING_ROBOT".equals(a.type())).toList();

        double cycle = (System.currentTimeMillis() / 1000.0 % 150.0) / 150.0;
        int overallProgress = (int) Math.round(cycle * 100);
        List<ProcessStep> process = buildProcess(overallProgress);
        List<RobotTelemetry> robots = new ArrayList<>();
        for (int i = 0; i < robotAssets.size(); i++) {
            robots.add(generateTelemetry(robotAssets.get(i), i, scenario, overallProgress));
        }

        persistHistoryAtInterval(robots);
        String risk = robots.stream().anyMatch(r -> "critical".equals(r.riskLevel())) ? "critical"
            : robots.stream().anyMatch(r -> "high".equals(r.riskLevel())) ? "high" : "low";
        repository.updateFacilityState(facility.id(), "low".equals(risk) ? "running" : "warning",
            risk, overallProgress);

        Facility current = new Facility(facility.id(), facility.code(), facility.name(), facility.type(),
            "low".equals(risk) ? "running" : "warning", risk, overallProgress,
            facility.mapX(), facility.mapY(), facility.mapWidth(), facility.mapHeight());
        List<Alarm> alarms = repository.findLatestAlarms(facility.id());
        return new ShopSnapshot(current, LocalDateTime.now(), "SIMULATOR",
            scenario.type(), round(5 + cycle * 90), process, assets, robots, alarms);
    }

    public List<HistoryPoint> history(String facilityCode, int limit) {
        return repository.findHistory(requireFacility(facilityCode).id(), limit);
    }

    @Transactional
    public ScenarioResult startScenario(
        String facilityCode,
        ScenarioRequest request,
        long requestedBy
    ) {
        Facility facility = requireFacility(facilityCode);
        ScenarioType type = parseScenario(request.type());
        repository.completeActiveScenarios(facility.id());
        LocalDateTime startedAt = LocalDateTime.now();
        if (type == ScenarioType.NORMAL) {
            repository.updateFacilityState(facility.id(), "running", "low", facility.progressPercent());
            return new ScenarioResult(0, facility.code(), type.name(), request.durationSeconds(),
                startedAt, startedAt);
        }

        long scenarioId = repository.startScenario(
            facility.id(), type.name(), request.durationSeconds(), requestedBy);
        Asset target = repository.findAssets(facility.id()).stream()
            .filter(a -> "WELDING_ROBOT".equals(a.type())).findFirst().orElse(null);
        ScenarioDescriptor descriptor = descriptor(type);
        repository.createAlarm(facility.id(), target == null ? null : target.id(), scenarioId,
            descriptor.code(), descriptor.severity(), descriptor.title(), descriptor.description());
        repository.updateFacilityState(facility.id(), "warning", descriptor.riskLevel(),
            facility.progressPercent());
        return new ScenarioResult(scenarioId, facility.code(), type.name(), request.durationSeconds(),
            startedAt, startedAt.plusSeconds(request.durationSeconds()));
    }

    public void acknowledgeAlarm(long alarmId) {
        repository.acknowledgeAlarm(alarmId);
    }

    private RobotTelemetry generateTelemetry(
        Asset asset,
        int index,
        ScenarioState scenario,
        int overallProgress
    ) {
        double time = System.currentTimeMillis() / 1000.0;
        double wave = Math.sin(time * 0.72 + index * 1.9);
        boolean affected = index == 0 && !"NORMAL".equals(scenario.type());
        double voltage = 27.8 + wave * 0.7;
        double current = 238 + wave * 11;
        double wireFeed = 8.6 + wave * 0.25;
        double travelSpeed = 42 + wave * 1.8;
        double torque = 48 + wave * 6;
        double temperature = 53 + wave * 2.5;
        double gasFlow = 18 + wave * 0.6;
        String state = index == 0 ? "WELDING" : "TRACKING";
        String risk = "low";
        String alarmCode = null;

        if (affected) {
            switch (scenario.type()) {
                case "CURRENT_SPIKE" -> { current = 378 + wave * 15; risk = "high"; alarmCode = "WELD_CURRENT_HIGH"; }
                case "GAS_FLOW_DROP" -> { gasFlow = 4.8 + wave * 0.4; risk = "high"; alarmCode = "SHIELD_GAS_LOW"; }
                case "AXIS_OVERLOAD" -> { torque = 96 + wave * 2; risk = "high"; alarmCode = "AXIS_TORQUE_HIGH"; }
                case "COMMUNICATION_LOSS" -> {
                    voltage = 0; current = 0; wireFeed = 0; travelSpeed = 0; torque = 0;
                    state = "OFFLINE"; risk = "critical"; alarmCode = "ROBOT_COMM_LOSS";
                }
                case "WELD_QUALITY_DRIFT" -> {
                    voltage = 34 + wave * 4.5; current = 180 + wave * 58;
                    risk = "high"; alarmCode = "WELD_PARAMETER_DRIFT";
                }
                default -> { }
            }
        }

        AxisAngles axes = new AxisAngles(
            round(20 + wave * 14), round(-35 + Math.sin(time * .43 + index) * 8),
            round(54 + Math.cos(time * .35 + index) * 11), round(wave * 26),
            round(12 + Math.cos(time * .57) * 8), round(Math.sin(time * .91) * 32));
        return new RobotTelemetry(asset.id(), asset.code(), asset.name(), asset.modelName(),
            LocalDateTime.now(), state, !"OFFLINE".equals(state), "T-BAR_WELD_MAIN",
            "SEAM-" + (index + 1), overallProgress, round(voltage), round(current),
            round(wireFeed), round(travelSpeed), round(torque), round(temperature),
            round(gasFlow), axes, affected ? scenario.type() : "NORMAL", risk, alarmCode);
    }

    private List<ProcessStep> buildProcess(int overall) {
        String[] codes = {"INBOUND", "ALIGN", "WELD", "INSPECT", "OUTBOUND"};
        String[] names = {"블록 반입", "위치 정렬", "로봇 용접", "품질 검사", "블록 반출"};
        int active = Math.min(4, overall / 20);
        List<ProcessStep> result = new ArrayList<>();
        for (int i = 0; i < codes.length; i++) {
            int progress = i < active ? 100 : i == active ? (overall - i * 20) * 5 : 0;
            result.add(new ProcessStep(codes[i], names[i], i < active ? "done" : i == active ? "active" : "waiting", progress));
        }
        return result;
    }

    private void persistHistoryAtInterval(List<RobotTelemetry> telemetry) {
        long now = System.currentTimeMillis();
        long previous = lastHistoryWrite.get();
        if (now - previous >= 5_000 && lastHistoryWrite.compareAndSet(previous, now)) {
            telemetry.forEach(repository::saveTelemetry);
        }
    }

    private Facility requireFacility(String code) {
        return repository.findFacility(code).orElseThrow(() ->
            new ApiException(HttpStatus.NOT_FOUND, "디지털 트윈 시설을 찾을 수 없습니다: " + code));
    }

    private ScenarioType parseScenario(String raw) {
        try {
            return ScenarioType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                "지원 시나리오: NORMAL, CURRENT_SPIKE, GAS_FLOW_DROP, AXIS_OVERLOAD, COMMUNICATION_LOSS, WELD_QUALITY_DRIFT");
        }
    }

    private ScenarioDescriptor descriptor(ScenarioType type) {
        return switch (type) {
            case CURRENT_SPIKE -> new ScenarioDescriptor("WELD_CURRENT_HIGH", "high", "high",
                "용접 전류 상한 초과", "설정 범위를 벗어난 전류가 감지된 시험 시나리오입니다.");
            case GAS_FLOW_DROP -> new ScenarioDescriptor("SHIELD_GAS_LOW", "high", "high",
                "보호가스 유량 저하", "보호가스 유량이 품질 기준 이하로 내려간 시험 시나리오입니다.");
            case AXIS_OVERLOAD -> new ScenarioDescriptor("AXIS_TORQUE_HIGH", "high", "high",
                "로봇 축 토크 과부하", "대표 용접 로봇의 축 부하가 임계값을 초과한 시험 시나리오입니다.");
            case COMMUNICATION_LOSS -> new ScenarioDescriptor("ROBOT_COMM_LOSS", "critical", "critical",
                "로봇 통신 단절", "로봇 게이트웨이의 데이터 수신이 중단된 시험 시나리오입니다.");
            case WELD_QUALITY_DRIFT -> new ScenarioDescriptor("WELD_PARAMETER_DRIFT", "medium", "high",
                "용접 파라미터 편차", "전압과 전류의 변동 폭이 품질 관리 기준을 벗어난 시험 시나리오입니다.");
            case NORMAL -> new ScenarioDescriptor("NORMAL", "low", "low", "정상", "정상 상태");
        };
    }

    private double round(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private enum ScenarioType {
        NORMAL, CURRENT_SPIKE, GAS_FLOW_DROP, AXIS_OVERLOAD, COMMUNICATION_LOSS, WELD_QUALITY_DRIFT
    }

    private record ScenarioDescriptor(String code, String severity, String riskLevel,
                                      String title, String description) {}
}
