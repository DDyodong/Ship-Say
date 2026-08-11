package com.example.safetyai.permit.service;

import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.common.util.JdbcInsert;
import com.example.safetyai.file.storage.FileStorage;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * LLM이 만든 언어별 TBM을 DB와 파일 저장소에 함께 적재합니다.
 * FILE_STORAGE_TYPE=s3 환경에서는 FileStorage 호출이 S3 PutObject로 연결됩니다.
 */
@Service
public class TbmMaterialService {
    private static final Logger log = LoggerFactory.getLogger(TbmMaterialService.class);
    static final String MATERIAL_TYPE = "script";
    static final String MODEL_NAME = "openai-tbm-localization";
    private static final String JSON_CONTENT_TYPE = "application/json; charset=utf-8";

    private final JdbcTemplate jdbcTemplate;
    private final FileStorage fileStorage;
    private final ObjectMapper objectMapper;

    public TbmMaterialService(JdbcTemplate jdbcTemplate, FileStorage fileStorage, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.fileStorage = fileStorage;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public long save(long permitId, Map<String, Object> guidance) {
        List<LocalizedMaterial> materials = localizedMaterials(guidance);
        if (materials.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "LLM 응답에 저장할 다국어 TBM이 없습니다.");
        }

        String sessionTitle = materials.stream()
            .filter(material -> "ko".equals(material.language()))
            .findFirst()
            .orElse(materials.get(0))
            .title();
        long sessionId = ensureTodaySession(permitId, sessionTitle);
        for (LocalizedMaterial material : materials) {
            storeMaterial(permitId, sessionId, material);
        }
        return sessionId;
    }

    static List<LocalizedMaterial> localizedMaterials(Map<String, Object> guidance) {
        Object value = guidance.get("localizedTbm");
        if (!(value instanceof List<?> values)) {
            return List.of();
        }

        List<LocalizedMaterial> materials = new ArrayList<>();
        for (Object item : values) {
            if (!(item instanceof Map<?, ?> map)) {
                continue;
            }
            String language = Objects.toString(map.get("language"), "").trim();
            String title = Objects.toString(map.get("title"), "").trim();
            String content = Objects.toString(map.get("content"), "").trim();
            if (!language.isBlank() && !title.isBlank() && !content.isBlank()) {
                materials.add(new LocalizedMaterial(language, title, content));
            }
        }
        return List.copyOf(materials);
    }

    private long ensureTodaySession(long permitId, String title) {
        List<Long> existing = jdbcTemplate.query(
            """
                SELECT id FROM tbm_sessions
                 WHERE permit_id = ? AND session_date = CURRENT_DATE
                 ORDER BY created_at DESC
                 LIMIT 1
                """,
            (resultSet, rowNumber) -> resultSet.getLong("id"),
            permitId
        );
        if (!existing.isEmpty()) {
            jdbcTemplate.update("UPDATE tbm_sessions SET title = ?, status = 'completed' WHERE id = ?", title, existing.get(0));
            return existing.get(0);
        }
        return JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO tbm_sessions (permit_id, title, session_date, status)
                SELECT id, ?, CURRENT_DATE, 'completed'
                  FROM work_permits
                 WHERE id = ? AND status NOT IN ('rejected', 'deleted')
                """,
            Arrays.asList(title, permitId)
        );
    }

    private void storeMaterial(long permitId, long sessionId, LocalizedMaterial material) {
        byte[] asset = assetBytes(permitId, sessionId, material);
        String storageName = "tbm/" + permitId + "/" + sessionId + "/" + safeLanguagePath(material.language()) + ".json";
        String storageKey;
        try {
            storageKey = fileStorage.store(asset, JSON_CONTENT_TYPE, storageName);
        } catch (IOException exception) {
            log.error(
                "TBM material storage failed: permitId={}, sessionId={}, language={}, storageName={}",
                permitId,
                sessionId,
                material.language(),
                storageName,
                exception
            );
            throw new ApiException(HttpStatus.BAD_GATEWAY, "다국어 TBM 파일 저장에 실패했습니다.");
        }

        Long fileId = existingFileId(sessionId, material.language());
        String originalName = "tbm-" + permitId + "-" + material.language() + ".json";
        String metadata = metadataJson(permitId, sessionId, material.language());
        if (fileId == null) {
            fileId = JdbcInsert.insert(
                jdbcTemplate,
                """
                    INSERT INTO files
                    (uploaded_by, storage_key, original_name, mime_type, file_type, file_size, metadata)
                    VALUES (?, ?, ?, ?, 'tbm_translation', ?, ?)
                    """,
                Arrays.asList(null, storageKey, originalName, JSON_CONTENT_TYPE, asset.length, metadata)
            );
        } else {
            jdbcTemplate.update(
                """
                    UPDATE files
                       SET storage_key = ?, original_name = ?, mime_type = ?, file_size = ?, metadata = ?
                     WHERE id = ?
                    """,
                storageKey,
                originalName,
                JSON_CONTENT_TYPE,
                asset.length,
                metadata,
                fileId
            );
        }

        jdbcTemplate.update(
            """
                INSERT INTO tbm_materials
                    (tbm_session_id, material_type, language, content, file_id, model_name)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    content = VALUES(content),
                    file_id = VALUES(file_id),
                    model_name = VALUES(model_name),
                    created_at = CURRENT_TIMESTAMP(6)
                """,
            sessionId,
            MATERIAL_TYPE,
            material.language(),
            material.content(),
            fileId,
            MODEL_NAME
        );
    }

    private Long existingFileId(long sessionId, String language) {
        List<Long> ids = jdbcTemplate.query(
            """
                SELECT file_id FROM tbm_materials
                 WHERE tbm_session_id = ? AND material_type = ? AND language = ?
                   AND file_id IS NOT NULL
                 LIMIT 1
                """,
            (resultSet, rowNumber) -> resultSet.getLong("file_id"),
            sessionId,
            MATERIAL_TYPE,
            language
        );
        return ids.isEmpty() ? null : ids.get(0);
    }

    private byte[] assetBytes(long permitId, long sessionId, LocalizedMaterial material) {
        Map<String, Object> asset = new LinkedHashMap<>();
        asset.put("permitId", permitId);
        asset.put("tbmSessionId", sessionId);
        asset.put("language", material.language());
        asset.put("title", material.title());
        asset.put("content", material.content());
        asset.put("modelName", MODEL_NAME);
        try {
            return objectMapper.writeValueAsString(asset).getBytes(StandardCharsets.UTF_8);
        } catch (JsonProcessingException exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "TBM 저장 파일을 생성할 수 없습니다.");
        }
    }

    private String metadataJson(long permitId, long sessionId, String language) {
        try {
            return objectMapper.writeValueAsString(Map.of(
                "permitId", permitId,
                "tbmSessionId", sessionId,
                "language", language,
                "generated", true
            ));
        } catch (JsonProcessingException exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "TBM 파일 메타데이터를 생성할 수 없습니다.");
        }
    }

    private String safeLanguagePath(String language) {
        return language.replaceAll("[^A-Za-z0-9-]", "_");
    }

    record LocalizedMaterial(String language, String title, String content) {
    }
}
