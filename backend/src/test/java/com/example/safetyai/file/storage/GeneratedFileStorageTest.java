package com.example.safetyai.file.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

class GeneratedFileStorageTest {
    @TempDir
    Path tempDir;

    @Test
    void localStorageWritesGeneratedTbmUnderGeneratedPrefix() throws Exception {
        LocalFileStorage storage = new LocalFileStorage(tempDir.toString());
        byte[] content = "{\"language\":\"ko\"}".getBytes(StandardCharsets.UTF_8);

        String key = storage.store(content, "application/json", "tbm/7/11/ko.json");

        assertThat(key).isEqualTo("generated/tbm/7/11/ko.json");
        assertThat(Files.readAllBytes(tempDir.resolve(key))).isEqualTo(content);
    }

    @Test
    void s3StorageCallsPutObjectForGeneratedTbm() throws Exception {
        S3Client s3Client = mock(S3Client.class);
        S3FileStorage storage = new S3FileStorage("tbm-bucket", s3Client);
        byte[] content = "translated".getBytes(StandardCharsets.UTF_8);

        String key = storage.store(content, "application/json; charset=utf-8", "tbm/7/11/uz.json");

        ArgumentCaptor<PutObjectRequest> request = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3Client).putObject(request.capture(), any(RequestBody.class));
        assertThat(key).isEqualTo("generated/tbm/7/11/uz.json");
        assertThat(request.getValue().bucket()).isEqualTo("tbm-bucket");
        assertThat(request.getValue().key()).isEqualTo(key);
        assertThat(request.getValue().contentType()).isEqualTo("application/json; charset=utf-8");
        assertThat(request.getValue().contentLength()).isEqualTo(content.length);
    }
}
