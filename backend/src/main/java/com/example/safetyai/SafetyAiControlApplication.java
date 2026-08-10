package com.example.safetyai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.scheduling.annotation.EnableAsync;

// proxyTargetClass=true: OpenAiPermitFieldGuidanceService.onFieldGuidanceRequested()처럼
// @Async가 붙었지만 구현 인터페이스(PermitFieldGuidanceService)엔 없는 메서드가 있으면,
// 기본 JDK 동적 프록시는 그 메서드를 노출하지 못해 @TransactionalEventListener 등록이
// 기동 시점에 IllegalStateException으로 죽는다. CGLIB(클래스 상속) 프록시로 강제해 해결.
@EnableAsync(proxyTargetClass = true)
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class SafetyAiControlApplication {

    public static void main(String[] args) {
        SpringApplication.run(SafetyAiControlApplication.class, args);
    }
}
