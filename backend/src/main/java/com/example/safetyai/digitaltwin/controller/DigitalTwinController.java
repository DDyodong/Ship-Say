package com.example.safetyai.digitaltwin.controller;

import com.example.safetyai.auth.service.AuthService.AuthenticatedUser;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.CoordinatesRequest;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.HistoryPoint;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.ScenarioRequest;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.ScenarioResult;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.ShopSnapshot;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.YardSnapshot;
import com.example.safetyai.digitaltwin.service.DigitalTwinService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/digital-twin")
public class DigitalTwinController {
    private final DigitalTwinService service;

    public DigitalTwinController(DigitalTwinService service) {
        this.service = service;
    }

    @GetMapping("/yard")
    public YardSnapshot yard() {
        return service.yardSnapshot();
    }

    @GetMapping("/shops/{facilityCode}")
    public ShopSnapshot shop(@PathVariable String facilityCode) {
        return service.shopSnapshot(facilityCode);
    }

    @GetMapping("/shops/{facilityCode}/history")
    public List<HistoryPoint> history(
        @PathVariable String facilityCode,
        @RequestParam(defaultValue = "120") int limit
    ) {
        return service.history(facilityCode, limit);
    }

    @PostMapping("/shops/{facilityCode}/scenarios")
    public ScenarioResult scenario(
        @PathVariable String facilityCode,
        @Valid @RequestBody ScenarioRequest request,
        Authentication authentication
    ) {
        AuthenticatedUser user = (AuthenticatedUser) authentication.getPrincipal();
        return service.startScenario(facilityCode, request, user.id());
    }

    @PatchMapping("/alarms/{alarmId}/acknowledge")
    public Map<String, Object> acknowledge(@PathVariable long alarmId) {
        service.acknowledgeAlarm(alarmId);
        return Map.of("acknowledged", true, "alarmId", alarmId);
    }

    // 카카오맵 "좌표 보정" 화면에서 실제 위경도를 클릭해서 지정했을 때 저장
    // ⚠ 지금은 로그인한 사용자면 누구나 호출 가능해요 (다른 엔드포인트들과 동일한 수준).
    //   관리자만 되게 막고 싶으면 @PreAuthorize("hasRole('ADMIN')") 추가하면 됩니다.
    @PatchMapping("/facilities/{facilityCode}/coordinates")
    public Map<String, Object> updateCoordinates(
        @PathVariable String facilityCode,
        @Valid @RequestBody CoordinatesRequest request
    ) {
        service.updateFacilityCoordinates(facilityCode, request.lat(), request.lng());
        return Map.of("updated", true, "facilityCode", facilityCode,
            "lat", request.lat(), "lng", request.lng());
    }
}