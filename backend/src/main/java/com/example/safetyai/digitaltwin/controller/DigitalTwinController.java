package com.example.safetyai.digitaltwin.controller;

import com.example.safetyai.auth.service.AuthService.AuthenticatedUser;
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
}
