package com.example.safetyai.notification.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FirebaseAdminConfiguration {

    @Bean
    @ConditionalOnProperty(name = "app.firebase.enabled", havingValue = "true")
    public FirebaseApp firebaseApp(
        @Value("${app.firebase.project-id:aivle25}") String projectId,
        @Value("${app.firebase.credentials-path:}") String credentialsPath,
        @Value("${app.firebase.service-account-json:}") String serviceAccountJson,
        @Value("${app.firebase.service-account-base64:}") String serviceAccountBase64
    ) throws IOException {
        GoogleCredentials credentials = loadCredentials(
            credentialsPath,
            serviceAccountJson,
            serviceAccountBase64
        );
        FirebaseOptions options = FirebaseOptions.builder()
            .setCredentials(credentials)
            .setProjectId(projectId)
            .build();
        return FirebaseApp.initializeApp(options);
    }

    @Bean
    @ConditionalOnProperty(name = "app.firebase.enabled", havingValue = "true")
    public FirebaseMessaging firebaseMessaging(FirebaseApp firebaseApp) {
        return FirebaseMessaging.getInstance(firebaseApp);
    }

    private GoogleCredentials loadCredentials(
        String credentialsPath,
        String serviceAccountJson,
        String serviceAccountBase64
    ) throws IOException {
        if (serviceAccountBase64 != null && !serviceAccountBase64.isBlank()) {
            try {
                byte[] decoded = Base64.getDecoder().decode(serviceAccountBase64.trim());
                return fromStream(new ByteArrayInputStream(decoded));
            } catch (IllegalArgumentException exception) {
                throw new IllegalStateException("FIREBASE_SERVICE_ACCOUNT_BASE64 형식이 올바르지 않습니다.", exception);
            }
        }
        if (serviceAccountJson != null && !serviceAccountJson.isBlank()) {
            return fromStream(new ByteArrayInputStream(serviceAccountJson.getBytes(StandardCharsets.UTF_8)));
        }
        if (credentialsPath != null && !credentialsPath.isBlank()) {
            return fromStream(Files.newInputStream(Path.of(credentialsPath)));
        }
        return GoogleCredentials.getApplicationDefault();
    }

    private GoogleCredentials fromStream(InputStream inputStream) throws IOException {
        try (inputStream) {
            return GoogleCredentials.fromStream(inputStream);
        }
    }
}
