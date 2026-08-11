package com.example.safetyai.file.controller;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.common.util.JdbcInsert;
import com.example.safetyai.file.storage.FileStorage;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/files")
public class FileController {
    private static final long MAX_IMAGE_SIZE = 10L * 1024L * 1024L;
    private static final long MAX_PERMIT_SIZE = 10L * 1024L * 1024L;
    private static final Set<String> IMAGE_TYPES = Set.of("image/jpeg", "image/png");
    private static final Set<String> ALLOWED_FILE_TYPES = Set.of("permit", "safety_report", "ppe_check");
    private static final byte[] PDF_SIGNATURE = {'%', 'P', 'D', 'F', '-'};
    private static final byte[] PNG_SIGNATURE = {
        (byte) 0x89, 'P', 'N', 'G', '\r', '\n', (byte) 0x1A, '\n'
    };

    private final JdbcTemplate jdbcTemplate;
    private final AuthService authService;
    private final FileStorage fileStorage;

    public FileController(JdbcTemplate jdbcTemplate, AuthService authService, FileStorage fileStorage) {
        this.jdbcTemplate = jdbcTemplate;
        this.authService = authService;
        this.fileStorage = fileStorage;
    }

    @PostMapping
    public Map<String, Object> upload(
        @RequestHeader(value = "Authorization", required = false) String authorization,
        @RequestParam MultipartFile file,
        @RequestParam String fileType
    ) throws IOException {
        long userId = authService.requireUserId(authorization);
        validateUpload(file, fileType);
        String storageName = UUID.randomUUID() + "-" + safeName(file.getOriginalFilename());
        String storageKey = fileStorage.store(file, storageName);

        long id = JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO files (uploaded_by, storage_key, original_name, mime_type, file_type, file_size)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
            Arrays.asList(userId, storageKey, file.getOriginalFilename(), file.getContentType(), fileType, file.getSize())
        );
        return Map.of("id", id, "originalName", file.getOriginalFilename(), "fileType", fileType, "size", file.getSize());
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(
        @RequestHeader(value = "Authorization", required = false) String authorization,
        @PathVariable long id
    ) {
        requireFileAccess(authorization, id);
        return jdbcTemplate.queryForMap(
            """
                SELECT id, uploaded_by, original_name, mime_type, file_type, file_size, created_at
                  FROM files
                 WHERE id = ?
                """,
            id
        );
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> download(
        @RequestHeader(value = "Authorization", required = false) String authorization,
        @PathVariable long id
    ) throws IOException {
        requireFileAccess(authorization, id);
        Map<String, Object> row = jdbcTemplate.queryForMap(
            "SELECT storage_key, original_name, mime_type FROM files WHERE id = ?",
            id
        );
        Resource resource = fileStorage.load(String.valueOf(row.get("storage_key")));
        String encodedName = URLEncoder.encode(String.valueOf(row.get("original_name")), StandardCharsets.UTF_8);
        String mimeType = row.get("mime_type") == null ? "application/octet-stream" : String.valueOf(row.get("mime_type"));
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_TYPE, mimeType)
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(encodedName).build().toString())
            .body(resource);
    }

    private String safeName(String originalName) {
        if (originalName == null || originalName.isBlank()) {
            return "upload.bin";
        }
        return originalName.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private void validateUpload(MultipartFile file, String fileType) throws IOException {
        if (file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "첨부할 파일을 선택해 주세요.");
        }
        if (!ALLOWED_FILE_TYPES.contains(fileType)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "지원하지 않는 파일 유형입니다.");
        }
        byte[] bytes = file.getBytes();
        if ("permit".equals(fileType)) {
            String originalName = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
            if (file.getSize() > MAX_PERMIT_SIZE) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "작업허가서는 10MB 이하만 업로드할 수 있습니다.");
            }
            if (!"application/pdf".equals(file.getContentType())
                || !originalName.endsWith(".pdf")
                || !startsWith(bytes, PDF_SIGNATURE)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "작업허가서는 올바른 PDF 파일만 지원합니다.");
            }
            return;
        }
        if (file.getSize() > MAX_IMAGE_SIZE) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "사진은 10MB 이하만 업로드할 수 있습니다.");
        }
        if (!IMAGE_TYPES.contains(file.getContentType())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "사진은 JPG 또는 PNG 형식만 지원합니다.");
        }
        boolean validImage = "image/jpeg".equals(file.getContentType())
            ? isJpeg(bytes)
            : startsWith(bytes, PNG_SIGNATURE);
        if (!validImage) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "파일 내용과 이미지 형식이 일치하지 않습니다.");
        }
    }

    private void requireFileAccess(String authorization, long fileId) {
        AuthService.AuthenticatedUser user = authService.authenticateBearer(authorization)
            .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
        List<Map<String, Object>> files = jdbcTemplate.queryForList(
            "SELECT uploaded_by, file_type FROM files WHERE id = ?",
            fileId
        );
        if (files.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "파일을 찾을 수 없습니다.");
        }
        Map<String, Object> file = files.get(0);
        Object ownerValue = file.get("uploaded_by");
        if (user.roles().contains("ADMIN")
            || ownerValue instanceof Number ownerId && ownerId.longValue() == user.id()) {
            return;
        }
        String fileType = String.valueOf(file.get("file_type"));
        if ("permit".equals(fileType)) {
            Integer assigned = jdbcTemplate.queryForObject(
                """
                    SELECT COUNT(*)
                      FROM work_permit_files wpf
                      JOIN work_permit_workers wpw ON wpw.permit_id = wpf.permit_id
                     WHERE wpf.file_id = ?
                       AND wpw.user_id = ?
                    """,
                Integer.class,
                fileId,
                user.id()
            );
            if (assigned != null && assigned > 0) {
                return;
            }
        }
        if ("tbm_translation".equals(fileType)) {
            Integer assigned = jdbcTemplate.queryForObject(
                """
                    SELECT COUNT(*)
                      FROM tbm_materials tm
                      JOIN tbm_sessions ts ON ts.id = tm.tbm_session_id
                      JOIN work_permit_workers wpw ON wpw.permit_id = ts.permit_id
                     WHERE tm.file_id = ?
                       AND wpw.user_id = ?
                    """,
                Integer.class,
                fileId,
                user.id()
            );
            if (assigned != null && assigned > 0) {
                return;
            }
        }
        throw new ApiException(HttpStatus.FORBIDDEN, "이 파일에 접근할 권한이 없습니다.");
    }

    private boolean startsWith(byte[] bytes, byte[] signature) {
        if (bytes.length < signature.length) {
            return false;
        }
        for (int index = 0; index < signature.length; index++) {
            if (bytes[index] != signature[index]) {
                return false;
            }
        }
        return true;
    }

    private boolean isJpeg(byte[] bytes) {
        return bytes.length >= 3
            && bytes[0] == (byte) 0xFF
            && bytes[1] == (byte) 0xD8
            && bytes[2] == (byte) 0xFF;
    }
}
