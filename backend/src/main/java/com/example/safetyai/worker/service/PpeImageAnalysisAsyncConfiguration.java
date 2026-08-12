package com.example.safetyai.worker.service;

import java.util.concurrent.Executor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class PpeImageAnalysisAsyncConfiguration {
    @Bean(name = "ppeImageAnalysisExecutor")
    public Executor ppeImageAnalysisExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("ppe-image-analysis-");
        executor.initialize();
        return executor;
    }
}
