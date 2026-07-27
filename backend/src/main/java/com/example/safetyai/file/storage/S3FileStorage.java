package com.example.safetyai.file.storage;

import com.example.safetyai.common.exception.ApiException;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

@Component
@ConditionalOnProperty(name = "app.file-storage.type", havingValue = "s3")
public class S3FileStorage implements FileStorage {
    private final String bucket;
    private final S3Client s3Client;

    public S3FileStorage(
        @Value("${app.file-storage.s3.bucket}") String bucket,
        @Value("${app.file-storage.s3.region}") String region
    ) {
        if (bucket == null || bucket.isBlank()) {
            throw new IllegalStateException("S3_BUCKET 환경변수가 필요합니다.");
        }
        this.bucket = bucket;
        this.s3Client = S3Client.builder()
            .region(Region.of(region))
            .build();
    }

    @Override
    public String store(MultipartFile file, String storageName) throws IOException {
        String storageKey = "uploads/" + storageName;
        PutObjectRequest request = PutObjectRequest.builder()
            .bucket(bucket)
            .key(storageKey)
            .contentType(file.getContentType())
            .contentLength(file.getSize())
            .build();
        try {
            s3Client.putObject(request, RequestBody.fromInputStream(file.getInputStream(), file.getSize()));
            return storageKey;
        } catch (S3Exception exception) {
            throw new IOException("S3 파일 업로드에 실패했습니다.", exception);
        }
    }

    @Override
    public Resource load(String storageKey) throws IOException {
        try {
            ResponseBytes<GetObjectResponse> object = s3Client.getObjectAsBytes(
                GetObjectRequest.builder().bucket(bucket).key(storageKey).build()
            );
            return new ByteArrayResource(object.asByteArray());
        } catch (NoSuchKeyException exception) {
            throw new ApiException(HttpStatus.NOT_FOUND, "파일을 찾을 수 없습니다.");
        } catch (S3Exception exception) {
            if (exception.statusCode() == HttpStatus.NOT_FOUND.value()) {
                throw new ApiException(HttpStatus.NOT_FOUND, "파일을 찾을 수 없습니다.");
            }
            throw new IOException("S3 파일 다운로드에 실패했습니다.", exception);
        }
    }
}
