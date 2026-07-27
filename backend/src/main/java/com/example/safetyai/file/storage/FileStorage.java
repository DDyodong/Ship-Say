package com.example.safetyai.file.storage;

import java.io.IOException;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

public interface FileStorage {
    String store(MultipartFile file, String storageName) throws IOException;

    Resource load(String storageKey) throws IOException;
}
