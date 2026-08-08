/*
  Project: 현장 안전 AI 관제 시스템
  Purpose: 요구사항 정의서 + ERD 기반 MySQL 8 초기 스키마

  구분:
  - [CORE] MVP 구현에도 거의 필요한 핵심 테이블
  - [FULL] 요구사항 정의서 기능을 그대로 구현할 때 필요한 확장 테이블

  참고:
  - AI 출력 결과는 추후 모델 응답 포맷이 바뀔 수 있어 JSON을 같이 둔다.
  - 파일은 files 테이블에 모으고, 업무 테이블에서 FK로 연결한다.
*/

-- =========================================================
-- [CORE] 사용자 / 권한
-- 기능: 로그인, 로그아웃, 사용자 정보, 관리자/작업자 권한 구분
-- 요구사항 매칭:
-- - 계정 > 로그인
-- - 계정 > 로그아웃
-- - 기준정보 > 권한 관리(RBAC)
-- =========================================================

CREATE TABLE sites (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  site_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  address TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

CREATE TABLE users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_no VARCHAR(50) UNIQUE,
  username VARCHAR(80) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name VARCHAR(80) NOT NULL,
  phone VARCHAR(30),
  company_name VARCHAR(150),
  language VARCHAR(20) DEFAULT 'ko',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

CREATE TABLE roles (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  role_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(80) NOT NULL,
  description TEXT
);

-- 애플리케이션 RBAC 기본 역할. 사용자별 역할은 user_roles에서 별도로 배정한다.
INSERT INTO roles (role_code, name, description) VALUES
  ('WORKER', '현장 작업자', '게시판, 파일, 작업허가서, 본인 위험 신고 기능을 사용합니다.'),
  ('ADMIN', '관리자', '관제, 작업허가, 위험 분석, 기준정보와 운영 기능을 관리합니다.'),
  ('AI_SERVICE', 'AI 서비스', 'AI 모델 실행 결과와 위험 점수를 등록하는 기계 계정입니다.');

CREATE TABLE user_roles (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  site_id BIGINT,
  site_scope_id BIGINT GENERATED ALWAYS AS (COALESCE(site_id, 0)) STORED,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT ux_user_roles_scope UNIQUE (user_id, role_id, site_scope_id),
  CONSTRAINT fk_user_roles_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_roles_role_id FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_user_roles_site_id FOREIGN KEY (site_id) REFERENCES sites(id)
);

-- [FULL] JWT refresh token / 세션 종료 관리가 필요할 때 사용
-- 기능: 토큰 폐기, 강제 로그아웃, 다중 기기 세션 추적
CREATE TABLE auth_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  issued_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at TIMESTAMP(6) NOT NULL,
  revoked_at TIMESTAMP(6),
  CONSTRAINT fk_auth_sessions_user_id FOREIGN KEY (user_id) REFERENCES users(id)
);


-- =========================================================
-- [CORE] 파일 / 문서 저장
-- 기능: 작업허가서 PDF, 사진 신고, 영상 스냅샷, TTS 음성 저장
-- 요구사항 매칭:
-- - 허가서 신청 > 문서 첨부
-- - TBM 브리핑 > TTS 리딩
-- - 위험 신고 > 사진/음성 신고
-- - 영상 감시 > 프레임/마스킹 결과 저장
-- =========================================================

CREATE TABLE files (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  uploaded_by BIGINT,
  storage_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type VARCHAR(100),
  file_type VARCHAR(40) NOT NULL,
  file_size BIGINT,
  checksum VARCHAR(128),
  metadata JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_files_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE TABLE board_posts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  author_id BIGINT NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  view_count INT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'published',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_board_posts_author_id FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE board_post_comments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT NOT NULL,
  author_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'published',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_board_post_comments_post_id FOREIGN KEY (post_id) REFERENCES board_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_board_post_comments_author_id FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE board_post_files (
  post_id BIGINT NOT NULL,
  file_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, file_id),
  CONSTRAINT fk_board_post_files_post_id FOREIGN KEY (post_id) REFERENCES board_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_board_post_files_file_id FOREIGN KEY (file_id) REFERENCES files(id)
);


-- =========================================================
-- [CORE] 현장 / 블록 / 위험구역 / 카메라
-- 기능: 현장 구역, 위험구역, ROI, CCTV 위치 관리
-- 요구사항 매칭:
-- - 영상 감시 > ROI 침입 탐지
-- - 위험 예측 > 2.5D 모델맵
-- - 인프라/배포 > 모니터링, 실시간 스트림
-- =========================================================

CREATE TABLE blocks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  site_id BIGINT NOT NULL,
  block_code VARCHAR(50) NOT NULL,
  grid_x INT,
  grid_y INT,
  polygon JSON,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE (site_id, block_code),
  CONSTRAINT fk_blocks_site_id FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE TABLE danger_zones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  block_id BIGINT NOT NULL,
  zone_type VARCHAR(50) NOT NULL,
  polygon JSON NOT NULL,
  threshold_score INT DEFAULT 70,
  access_limit INT,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_danger_zones_block_id FOREIGN KEY (block_id) REFERENCES blocks(id)
);

CREATE TABLE cameras (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  site_id BIGINT NOT NULL,
  block_id BIGINT,
  camera_code VARCHAR(50) NOT NULL,
  name VARCHAR(120),
  stream_url TEXT,
  edge_device VARCHAR(120),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE (site_id, camera_code),
  CONSTRAINT fk_cameras_site_id FOREIGN KEY (site_id) REFERENCES sites(id),
  CONSTRAINT fk_cameras_block_id FOREIGN KEY (block_id) REFERENCES blocks(id)
);


-- =========================================================
-- [CORE] 작업허가서
-- 기능: 작업허가서 신청, 작업 내용/시간/위치/인원 저장
-- 요구사항 매칭:
-- - 허가서 신청 > 문서 첨부
-- - 허가서 분석 > 위험 조건 도출
-- - 조건 수신 > 체크리스트 조회
-- =========================================================

CREATE TABLE work_permits (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  permit_no VARCHAR(80) UNIQUE,
  site_id BIGINT NOT NULL,
  block_id BIGINT,
  applicant_id BIGINT NOT NULL,
  work_type VARCHAR(80),
  work_title TEXT,
  work_content TEXT,
  worker_count INT,
  equipment TEXT,
  start_time TIMESTAMP(6),
  end_time TIMESTAMP(6),
  gps_lat NUMERIC(10, 7),
  gps_lng NUMERIC(10, 7),
  is_high_risk BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  decision_note TEXT,
  decided_by BIGINT,
  decided_at TIMESTAMP(6),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_work_permits_site_id FOREIGN KEY (site_id) REFERENCES sites(id),
  CONSTRAINT fk_work_permits_block_id FOREIGN KEY (block_id) REFERENCES blocks(id),
  CONSTRAINT fk_work_permits_applicant_id FOREIGN KEY (applicant_id) REFERENCES users(id),
  CONSTRAINT fk_work_permits_decided_by FOREIGN KEY (decided_by) REFERENCES users(id)
);

CREATE TABLE work_permit_files (
  permit_id BIGINT NOT NULL,
  file_id BIGINT NOT NULL,
  purpose VARCHAR(50) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (permit_id, file_id),
  CONSTRAINT fk_work_permit_files_permit_id FOREIGN KEY (permit_id) REFERENCES work_permits(id) ON DELETE CASCADE,
  CONSTRAINT fk_work_permit_files_file_id FOREIGN KEY (file_id) REFERENCES files(id)
);

-- [FULL] 허가서 PDF 분석 결과 저장
-- 기능: PDF에서 작업명/공종/위험요인/추천 조건을 추출하고 화면에 보여줌
-- 요구사항 매칭:
-- - 허가서 분석 > 통합 안전 기준 요약
-- - 허가서 분석 > 승인 조건 도출
CREATE TABLE permit_analysis_results (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  permit_id BIGINT NOT NULL,
  analysis_type VARCHAR(50) NOT NULL,
  model_name VARCHAR(80),
  summary TEXT,
  extracted_data JSON NOT NULL DEFAULT (JSON_OBJECT()),
  risk_factors JSON NOT NULL DEFAULT (JSON_ARRAY()),
  recommended_conditions JSON NOT NULL DEFAULT (JSON_ARRAY()),
  confidence NUMERIC(5, 4),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_permit_analysis_results_permit_id FOREIGN KEY (permit_id) REFERENCES work_permits(id) ON DELETE CASCADE
);

-- [FULL] 유사 사고 검색 결과 저장
-- 기능: 중대재해 사례 검색, 유사사례를 허가서 검토 화면에 표시
-- 요구사항 매칭:
-- - 허가서 분석 > 유사사고 검색
CREATE TABLE similar_accident_results (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  permit_id BIGINT NOT NULL,
  source_title TEXT,
  source_url TEXT,
  accident_type VARCHAR(80),
  similarity_score NUMERIC(6, 4),
  summary TEXT,
  payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_similar_accident_results_permit_id FOREIGN KEY (permit_id) REFERENCES work_permits(id) ON DELETE CASCADE
);


-- =========================================================
-- [CORE] 안전 기준 / 룰 체크 / 체크리스트
-- 기능: 안전 기준 저장, 허가서 조건 검증, 작업자 확인 체크리스트
-- 요구사항 매칭:
-- - TBM 브리핑 > 안전용어 교정
-- - TBM 브리핑 > 다국어 번역
-- - 조건 수신 > 체크리스트 조회
-- - 조건 수신 > 긴급 알림
-- =========================================================

CREATE TABLE safety_rules (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  rule_code VARCHAR(80) UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category VARCHAR(80),
  original_text TEXT NOT NULL,
  easy_text TEXT,
  language VARCHAR(20) DEFAULT 'ko',
  severity VARCHAR(30),
  source TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

CREATE TABLE rule_checks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  permit_id BIGINT,
  rule_id BIGINT NOT NULL,
  checker_type VARCHAR(30) NOT NULL DEFAULT 'ai',
  check_result VARCHAR(30) NOT NULL,
  result_score INT,
  evidence TEXT,
  payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_rule_checks_permit_id FOREIGN KEY (permit_id) REFERENCES work_permits(id) ON DELETE CASCADE,
  CONSTRAINT fk_rule_checks_rule_id FOREIGN KEY (rule_id) REFERENCES safety_rules(id)
);

CREATE TABLE checklist_templates (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  site_id BIGINT,
  work_type VARCHAR(80),
  title VARCHAR(150) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_checklist_templates_site_id FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE TABLE checklist_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT NOT NULL,
  rule_id BIGINT,
  item_text TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT fk_checklist_items_template_id FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_checklist_items_rule_id FOREIGN KEY (rule_id) REFERENCES safety_rules(id)
);


-- =========================================================
-- [CORE] TBM 브리핑
-- 기능: 작업 전 브리핑, 번역/쉬운 설명/TTS, 참석 확인
-- 요구사항 매칭:
-- - TBM 브리핑 > 한국어 음성인식
-- - TBM 브리핑 > 안전용어 교정
-- - TBM 브리핑 > 다국어 번역
-- - TBM 브리핑 > TTS 리딩
-- - TBM 브리핑 > 전달 확인
-- =========================================================

CREATE TABLE tbm_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  permit_id BIGINT NOT NULL,
  host_id BIGINT,
  title VARCHAR(150),
  session_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  status VARCHAR(30) NOT NULL DEFAULT 'planned',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_tbm_sessions_permit_id FOREIGN KEY (permit_id) REFERENCES work_permits(id) ON DELETE CASCADE,
  CONSTRAINT fk_tbm_sessions_host_id FOREIGN KEY (host_id) REFERENCES users(id)
);

CREATE TABLE tbm_materials (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tbm_session_id BIGINT NOT NULL,
  material_type VARCHAR(50) NOT NULL,
  language VARCHAR(20) DEFAULT 'ko',
  content TEXT,
  file_id BIGINT,
  model_name VARCHAR(80),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_tbm_materials_tbm_session_id FOREIGN KEY (tbm_session_id) REFERENCES tbm_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_tbm_materials_file_id FOREIGN KEY (file_id) REFERENCES files(id)
);

CREATE TABLE tbm_attendance (
  tbm_session_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  confirmed_at TIMESTAMP(6),
  signature_file_id BIGINT,
  PRIMARY KEY (tbm_session_id, user_id),
  CONSTRAINT fk_tbm_attendance_tbm_session_id FOREIGN KEY (tbm_session_id) REFERENCES tbm_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_tbm_attendance_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_tbm_attendance_signature_file_id FOREIGN KEY (signature_file_id) REFERENCES files(id)
);

CREATE TABLE checklist_responses (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tbm_session_id BIGINT NOT NULL,
  checklist_item_id BIGINT NOT NULL,
  responder_id BIGINT NOT NULL,
  response_value VARCHAR(30) NOT NULL,
  note TEXT,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_checklist_responses_tbm_session_id FOREIGN KEY (tbm_session_id) REFERENCES tbm_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_checklist_responses_checklist_item_id FOREIGN KEY (checklist_item_id) REFERENCES checklist_items(id),
  CONSTRAINT fk_checklist_responses_responder_id FOREIGN KEY (responder_id) REFERENCES users(id)
);


-- =========================================================
-- [FULL] 승인 워크플로우
-- 기능: 관리자 조건 선택, 단계별 승인/반려, 승인 이력
-- 요구사항 매칭:
-- - 허가서 분석 > 승인 워크플로우
-- - 관리자기능 > 작업 허가서 조건 검토/승인
-- =========================================================

CREATE TABLE approval_flows (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  permit_id BIGINT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at TIMESTAMP(6),
  CONSTRAINT fk_approval_flows_permit_id FOREIGN KEY (permit_id) REFERENCES work_permits(id) ON DELETE CASCADE
);

CREATE TABLE approval_steps (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  flow_id BIGINT NOT NULL,
  step_order INT NOT NULL,
  approver_id BIGINT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  condition_text TEXT,
  comment TEXT,
  decided_at TIMESTAMP(6),
  UNIQUE (flow_id, step_order),
  CONSTRAINT fk_approval_steps_flow_id FOREIGN KEY (flow_id) REFERENCES approval_flows(id) ON DELETE CASCADE,
  CONSTRAINT fk_approval_steps_approver_id FOREIGN KEY (approver_id) REFERENCES users(id)
);


-- =========================================================
-- [FULL] 영상 감시 / 위험 이벤트
-- 기능: PPE 위반, ROI 침입, 작업자 미식별, 사진/음성 신고, 이벤트 처리 이력
-- 요구사항 매칭:
-- - 영상 감시 > PPE 위반 탐지
-- - 영상 감시 > 작업자 비식별화
-- - 영상 감시 > ROI 침입 탐지
-- - 영상 감시 > 관제 대시보드
-- - 위험 신고 > 사진/음성 신고
-- =========================================================

CREATE TABLE vision_detections (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  camera_id BIGINT,
  block_id BIGINT,
  zone_id BIGINT,
  file_id BIGINT,
  detection_type VARCHAR(60) NOT NULL,
  object_label VARCHAR(80),
  confidence NUMERIC(5, 4),
  bbox JSON,
  is_worker_identified BOOLEAN,
  worker_id BIGINT,
  payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  detected_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_vision_detections_camera_id FOREIGN KEY (camera_id) REFERENCES cameras(id),
  CONSTRAINT fk_vision_detections_block_id FOREIGN KEY (block_id) REFERENCES blocks(id),
  CONSTRAINT fk_vision_detections_zone_id FOREIGN KEY (zone_id) REFERENCES danger_zones(id),
  CONSTRAINT fk_vision_detections_file_id FOREIGN KEY (file_id) REFERENCES files(id),
  CONSTRAINT fk_vision_detections_worker_id FOREIGN KEY (worker_id) REFERENCES users(id)
);

CREATE TABLE safety_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(60) NOT NULL,
  source_type VARCHAR(30) NOT NULL,
  reporter_id BIGINT,
  permit_id BIGINT,
  block_id BIGINT,
  zone_id BIGINT,
  detection_id BIGINT,
  file_id BIGINT,
  severity VARCHAR(30) NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  event_time TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_safety_events_reporter_id FOREIGN KEY (reporter_id) REFERENCES users(id),
  CONSTRAINT fk_safety_events_permit_id FOREIGN KEY (permit_id) REFERENCES work_permits(id),
  CONSTRAINT fk_safety_events_block_id FOREIGN KEY (block_id) REFERENCES blocks(id),
  CONSTRAINT fk_safety_events_zone_id FOREIGN KEY (zone_id) REFERENCES danger_zones(id),
  CONSTRAINT fk_safety_events_detection_id FOREIGN KEY (detection_id) REFERENCES vision_detections(id),
  CONSTRAINT fk_safety_events_file_id FOREIGN KEY (file_id) REFERENCES files(id)
);

CREATE TABLE event_actions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT NOT NULL,
  actor_id BIGINT,
  action_type VARCHAR(50) NOT NULL,
  comment TEXT,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_event_actions_event_id FOREIGN KEY (event_id) REFERENCES safety_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_actions_actor_id FOREIGN KEY (actor_id) REFERENCES users(id)
);


-- =========================================================
-- [FULL] 위험 예측 / What-if 시뮬레이션
-- 기능: 위험도 산출, 2.5D 모델맵, 조치 변경 후 위험도 재계산
-- 요구사항 매칭:
-- - 위험 예측 > 위험도 산출
-- - 위험 예측 > 2.5D 모델맵
-- - 위험 예측 > What-if 재계산
-- =========================================================

CREATE TABLE risk_scores (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  permit_id BIGINT,
  block_id BIGINT,
  zone_id BIGINT,
  event_id BIGINT,
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  risk_level VARCHAR(30) NOT NULL,
  model_name VARCHAR(80),
  factors JSON NOT NULL DEFAULT (JSON_OBJECT()),
  shap_values JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_risk_scores_permit_id FOREIGN KEY (permit_id) REFERENCES work_permits(id),
  CONSTRAINT fk_risk_scores_block_id FOREIGN KEY (block_id) REFERENCES blocks(id),
  CONSTRAINT fk_risk_scores_zone_id FOREIGN KEY (zone_id) REFERENCES danger_zones(id),
  CONSTRAINT fk_risk_scores_event_id FOREIGN KEY (event_id) REFERENCES safety_events(id)
);

CREATE TABLE risk_simulations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  permit_id BIGINT,
  block_id BIGINT,
  requested_by BIGINT,
  scenario_type VARCHAR(50) NOT NULL,
  input_payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  before_score INT,
  after_score INT,
  result_summary TEXT,
  result_payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  simulated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_risk_simulations_permit_id FOREIGN KEY (permit_id) REFERENCES work_permits(id),
  CONSTRAINT fk_risk_simulations_block_id FOREIGN KEY (block_id) REFERENCES blocks(id),
  CONSTRAINT fk_risk_simulations_requested_by FOREIGN KEY (requested_by) REFERENCES users(id)
);


-- =========================================================
-- [FULL] 알림 / 모델 운영 / 감사 로그
-- 기능: 앱 푸시, SNS, WebSocket, AI 추론 작업, 관리자 이력
-- 요구사항 매칭:
-- - 실시간 > API GW WebSocket
-- - 실시간 > 푸시 알림
-- - 인프라/배포 > 이벤트 스키마 확장
-- - 기준정보 > 감사 로그
-- =========================================================

CREATE TABLE notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT,
  user_id BIGINT,
  actor_id BIGINT,
  channel VARCHAR(30) NOT NULL,
  notification_type VARCHAR(50) NOT NULL DEFAULT 'general',
  dedupe_key VARCHAR(180),
  title TEXT NOT NULL,
  message TEXT,
  target_url VARCHAR(500),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  push_status VARCHAR(30) NOT NULL DEFAULT 'not_attempted',
  push_sent_count INT NOT NULL DEFAULT 0,
  push_failed_count INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMP(6),
  acknowledged_at TIMESTAMP(6),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_notifications_event_id FOREIGN KEY (event_id) REFERENCES safety_events(id),
  CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_notifications_actor_id FOREIGN KEY (actor_id) REFERENCES users(id),
  CONSTRAINT uq_notifications_dedupe_key UNIQUE (dedupe_key),
  INDEX ix_notifications_user_created (user_id, created_at DESC)
);

CREATE TABLE permit_simops_conflicts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  permit_a_id BIGINT NOT NULL,
  permit_b_id BIGINT NOT NULL,
  rule_code VARCHAR(80) NOT NULL,
  risk VARCHAR(30) NOT NULL,
  reason TEXT NOT NULL,
  legal_ref TEXT,
  work_types JSON NOT NULL DEFAULT (JSON_ARRAY()),
  zone_relation VARCHAR(50),
  detected_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_permit_simops_pair_rule (permit_a_id, permit_b_id, rule_code),
  CONSTRAINT fk_permit_simops_conflicts_a FOREIGN KEY (permit_a_id) REFERENCES work_permits(id) ON DELETE CASCADE,
  CONSTRAINT fk_permit_simops_conflicts_b FOREIGN KEY (permit_b_id) REFERENCES work_permits(id) ON DELETE CASCADE,
  CONSTRAINT chk_permit_simops_order CHECK (permit_a_id < permit_b_id)
);

CREATE INDEX idx_permit_simops_conflicts_b ON permit_simops_conflicts(permit_b_id);

CREATE TABLE model_runs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  model_name VARCHAR(80) NOT NULL,
  model_version VARCHAR(50),
  input_type VARCHAR(50) NOT NULL,
  input_ref_id BIGINT,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  started_at TIMESTAMP(6),
  finished_at TIMESTAMP(6),
  output_payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  error_message TEXT
);

CREATE TABLE audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT,
  action VARCHAR(80) NOT NULL,
  target_table VARCHAR(80),
  target_id BIGINT,
  before_data JSON,
  after_data JSON,
  ip_address VARCHAR(45),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_audit_logs_actor_id FOREIGN KEY (actor_id) REFERENCES users(id)
);


-- =========================================================
-- 조회 성능용 인덱스
-- =========================================================

CREATE INDEX idx_work_permits_site_status ON work_permits(site_id, status);
CREATE INDEX idx_work_permits_time ON work_permits(start_time, end_time);
CREATE INDEX idx_rule_checks_permit ON rule_checks(permit_id);
CREATE INDEX idx_safety_events_status_time ON safety_events(status, event_time DESC);
CREATE INDEX idx_vision_detections_time ON vision_detections(detected_at DESC);
CREATE INDEX idx_risk_scores_created ON risk_scores(created_at DESC);
CREATE INDEX idx_notifications_user_status ON notifications(user_id, status);
CREATE INDEX idx_board_posts_status_time ON board_posts(status, created_at DESC);
