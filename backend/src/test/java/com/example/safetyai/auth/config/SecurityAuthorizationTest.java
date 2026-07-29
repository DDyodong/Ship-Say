package com.example.safetyai.auth.config;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.safetyai.auth.security.BearerTokenAuthenticationFilter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@WebMvcTest(controllers = SecurityTestController.class)
@Import({SecurityConfig.class, SecurityTestController.class})
class SecurityAuthorizationTest {
    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private BearerTokenAuthenticationFilter bearerTokenAuthenticationFilter;

    @MockBean
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void letMockBearerFilterContinueTheChain() throws Exception {
        doAnswer(invocation -> {
            invocation.<jakarta.servlet.FilterChain>getArgument(2).doFilter(
                invocation.getArgument(0),
                invocation.getArgument(1)
            );
            return null;
        }).when(bearerTokenAuthenticationFilter).doFilter(any(), any(), any());
    }

    @Test
    void anonymousUserCannotCallProtectedApi() throws Exception {
        mockMvc.perform(get("/api/master/sites"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void workerCanReadMasterDataButCannotCreateIt() throws Exception {
        mockMvc.perform(get("/api/master/sites").with(user("worker").roles("WORKER")))
            .andExpect(status().isOk());

        mockMvc.perform(post("/api/master/sites")
                .with(user("worker").roles("WORKER"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void adminCanCreateMasterData() throws Exception {
        mockMvc.perform(post("/api/master/sites")
                .with(user("admin").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isOk());
    }

    @Test
    void onlyAdminCanReadOperationalDashboard() throws Exception {
        mockMvc.perform(get("/api/dashboard/summary").with(user("worker").roles("WORKER")))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/dashboard/summary").with(user("ai").roles("AI_SERVICE")))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/dashboard/summary").with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk());
    }

    @Test
    void aiServiceCanSubmitButCannotReadAiResults() throws Exception {
        mockMvc.perform(post("/api/ai/model-runs").with(user("ai").roles("AI_SERVICE")))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/ai/model-runs").with(user("ai").roles("AI_SERVICE")))
            .andExpect(status().isForbidden());
    }

    @Test
    void onlyAdminCanCreateWorkPermit() throws Exception {
        mockMvc.perform(post("/api/work-permits").with(user("worker").roles("WORKER")))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/work-permits").with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk());
    }

    @Test
    void workerCanReadAssignedPermitsButOnlyAdminCanMutatePermits() throws Exception {
        mockMvc.perform(get("/api/work-permits").with(user("worker").roles("WORKER")))
            .andExpect(status().isOk());
        mockMvc.perform(put("/api/work-permits/1").with(user("worker").roles("WORKER")))
            .andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/work-permits/1").with(user("worker").roles("WORKER")))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/work-permits/1/restore").with(user("worker").roles("WORKER")))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/work-permits/1").with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk());
        mockMvc.perform(delete("/api/work-permits/1").with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk());
        mockMvc.perform(post("/api/work-permits/1/restore").with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/work-permits").with(user("ai").roles("AI_SERVICE")))
            .andExpect(status().isForbidden());
    }

    @Test
    void workerCanUseWorkerAppApis() throws Exception {
        mockMvc.perform(get("/api/worker/tbm/today").with(user("worker").roles("WORKER")))
            .andExpect(status().isOk());
        mockMvc.perform(post("/api/worker/tbm/confirm").with(user("worker").roles("WORKER")))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/worker/personal-checks/today").with(user("worker").roles("WORKER")))
            .andExpect(status().isOk());
        mockMvc.perform(post("/api/worker/personal-checks").with(user("worker").roles("WORKER")))
            .andExpect(status().isOk());
    }

    @Test
    void onlyAdminCanReadDeletedPermits() throws Exception {
        mockMvc.perform(get("/api/work-permits/trash").with(user("worker").roles("WORKER")))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/work-permits/trash").with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk());
    }

    @Test
    void workerCanUseOwnEventFeedButNotSiteWideFeedOrActions() throws Exception {
        mockMvc.perform(get("/api/safety-events/my").with(user("worker").roles("WORKER")))
            .andExpect(status().isOk());
        mockMvc.perform(post("/api/safety-events").with(user("worker").roles("WORKER")))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/safety-events").with(user("worker").roles("WORKER")))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/safety-events/1/actions").with(user("worker").roles("WORKER")))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/safety-events/1/actions").with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk());
    }

    @Test
    void aiServiceCannotUseHumanFeatures() throws Exception {
        mockMvc.perform(get("/api/board/posts").with(user("ai").roles("AI_SERVICE")))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/risks/simulations").with(user("ai").roles("AI_SERVICE")))
            .andExpect(status().isForbidden());
    }

    @Test
    void unlistedApiIsDeniedByDefault() throws Exception {
        mockMvc.perform(get("/api/not-configured").with(user("admin").roles("ADMIN")))
            .andExpect(status().isForbidden());
    }
}
