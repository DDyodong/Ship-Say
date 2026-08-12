package com.example.safetyai.file.storage;

import com.example.safetyai.common.exception.ApiException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
@ConditionalOnProperty(name = "app.file-storage.type", havingValue = "local", matchIfMissing = true)
public class LocalFileStorage implements FileStorage {
    private final Path uploadDir;

    public LocalFileStorage(@Value("${app.file-storage.local-dir}") String uploadDir) {
        this.uploadDir = Path.of(uploadDir).toAbsolutePath().normalize();
    }

    @Override
    public String store(MultipartFile file, String storageName) throws IOException {
        Files.createDirectories(uploadDir);
        Path target = resolveLocalPath(storageName);
        Files.createDirectories(target.getParent());
        file.transferTo(target);
        return storageName;
    }

    @Override
    public String store(byte[] content, String contentType, String storageName) throws IOException {
        Files.createDirectories(uploadDir);
        Path target = resolveLocalPath("generated/" + storageName);
        Files.createDirectories(target.getParent());
        Files.write(target, content);
        return uploadDir.relativize(target).toString().replace('\\', '/');
    }

    @Override
    public Resource load(String storageKey) throws IOException {
        Path path = resolveLocalPath(storageKey);
        if (!Files.isRegularFile(path)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "파일을 찾을 수 없습니다.");
        }
        return new UrlResource(path.toUri());
    }

    private Path resolveLocalPath(String storageKey) {
        Path storedPath = Path.of(storageKey);
        if (storedPath.isAbsolute()) {
            return storedPath.normalize();
        }

        Path resolved = uploadDir.resolve(storedPath).normalize();
        if (!resolved.startsWith(uploadDir)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "유효하지 않은 파일 경로입니다.");
        }
        return resolved;
    }
}
