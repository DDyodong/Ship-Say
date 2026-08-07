package com.example.safetyai.auth.config;

import com.example.safetyai.auth.security.BearerTokenAuthenticationFilter;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {
    private static final String[] HUMAN_ROLES = {"WORKER", "ADMIN"};

    private final BearerTokenAuthenticationFilter bearerTokenAuthenticationFilter;

    public SecurityConfig(BearerTokenAuthenticationFilter bearerTokenAuthenticationFilter) {
        this.bearerTokenAuthenticationFilter = bearerTokenAuthenticationFilter;
    }

    @Bean
    public static PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .formLogin(form -> form.disable())
            .httpBasic(basic -> basic.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                // Internal error dispatch (e.g. an uncaught DB exception forwarding to /error).
                // Without this, /error falls through to anyRequest().denyAll() below and a real
                // 500 gets masked as a misleading 401 "로그인이 필요합니다.".
                .requestMatchers("/error").permitAll()
                .requestMatchers("/api/health", "/api/auth/register", "/api/auth/login").permitAll()
                .requestMatchers("/api/auth/employees/verify", "/api/auth/usernames/*/availability").permitAll()
                .requestMatchers("/api/auth/logout").authenticated()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")

                // Human users may read master data, but only administrators may change it.
                .requestMatchers(HttpMethod.POST, "/api/master/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/master/**").hasAnyRole(HUMAN_ROLES)

                // Site-wide operational data and event actions are administrator features.
                .requestMatchers("/api/dashboard/**", "/api/digital-twin/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/safety-events", "/api/safety-events/reports").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/safety-events/*/actions").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/safety-events/my").hasAnyRole(HUMAN_ROLES)
                .requestMatchers(HttpMethod.POST, "/api/safety-events").hasAnyRole(HUMAN_ROLES)
                .requestMatchers("/api/worker/tbm/**").hasAnyRole(HUMAN_ROLES)
                .requestMatchers("/api/worker/personal-checks/**").hasAnyRole(HUMAN_ROLES)
                .requestMatchers("/api/notifications/**").hasAnyRole(HUMAN_ROLES)

                // Administrators manage permits. Workers may read only permits assigned to them;
                // WorkPermitController enforces that row-level boundary.
                .requestMatchers(HttpMethod.POST, "/api/work-permits").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/work-permits/trash").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/work-permits", "/api/work-permits/**").hasAnyRole(HUMAN_ROLES)
                .requestMatchers(HttpMethod.PUT, "/api/work-permits/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/work-permits/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/work-permits/*/restore").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/work-permits/*/analyze").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/work-permits/*/decision").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/work-permits/*/supplement-request").hasRole("ADMIN")

                // Board and file features are for interactive human accounts.
                .requestMatchers("/api/board/**", "/api/files/**").hasAnyRole(HUMAN_ROLES)

                // AI_SERVICE is a machine account used only to submit model outputs.
                .requestMatchers(HttpMethod.POST, "/api/ai/**").hasAnyRole("ADMIN", "AI_SERVICE")
                .requestMatchers(HttpMethod.GET, "/api/ai/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/risks/scores").hasAnyRole("ADMIN", "AI_SERVICE")
                .requestMatchers(HttpMethod.GET, "/api/risks/scores").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/risks/simulations").hasAnyRole(HUMAN_ROLES)

                // New APIs must be assigned to a role explicitly.
                .anyRequest().denyAll()
            )
            .exceptionHandling(exceptions -> exceptions
                .authenticationEntryPoint((request, response, exception) -> {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"message\":\"로그인이 필요합니다.\"}");
                })
                .accessDeniedHandler((request, response, exception) -> {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"message\":\"접근 권한이 없습니다.\"}");
                })
            )
            .addFilterBefore(bearerTokenAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(List.of("http://localhost:*", "http://127.0.0.1:*", "https://df47xszv4nn0z.cloudfront.net"));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        configuration.setExposedHeaders(List.of("Authorization"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
