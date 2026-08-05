package com.example.safetyai.permit.controller;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.permit.dto.WorkPermitRequest;
import com.example.safetyai.permit.service.WorkPermitService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/work-permits")
public class WorkPermitController {
    private final WorkPermitService workPermitService;

    public WorkPermitController(WorkPermitService workPermitService) {
        this.workPermitService = workPermitService;
    }

    @GetMapping
    public List<Map<String, Object>> list(
        @AuthenticationPrincipal AuthService.AuthenticatedUser user,
        @RequestParam(required = false) String status
    ) {
        return workPermitService.list(user, status);
    }

    @GetMapping("/today")
    public Map<String, Object> today(@AuthenticationPrincipal AuthService.AuthenticatedUser user) {
        return workPermitService.today(user);
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(
        @AuthenticationPrincipal AuthService.AuthenticatedUser user,
        @PathVariable long id
    ) {
        return workPermitService.get(user, id);
    }

    @PostMapping
    public Map<String, Object> create(
        @RequestHeader(value = "Authorization", required = false) String authorization,
        @Valid @RequestBody WorkPermitRequest request
    ) {
        return workPermitService.create(authorization, request);
    }

    @GetMapping("/trash")
    public List<Map<String, Object>> trash() {
        return workPermitService.trash();
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(
        @RequestHeader(value = "Authorization", required = false) String authorization,
        @PathVariable long id,
        @Valid @RequestBody WorkPermitRequest request
    ) {
        return workPermitService.update(authorization, id, request);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(
        @RequestHeader(value = "Authorization", required = false) String authorization,
        @PathVariable long id
    ) {
        return workPermitService.delete(authorization, id);
    }

    @PostMapping("/{id}/restore")
    public Map<String, Object> restore(
        @RequestHeader(value = "Authorization", required = false) String authorization,
        @PathVariable long id
    ) {
        return workPermitService.restore(authorization, id);
    }

    @DeleteMapping("/{id}/permanent")
    public Map<String, Object> permanentDelete(
        @RequestHeader(value = "Authorization", required = false) String authorization,
        @PathVariable long id
    ) {
        return workPermitService.permanentDelete(authorization, id);
    }
}
