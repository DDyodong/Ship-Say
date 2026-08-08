-- [FULL] 관리자 최종 승인/조건부 승인/반려 및 보완 요청 사유 저장
-- 기능: 규칙 엔진 판정을 반영해 관리자가 최종 상태를 확정하고, 보완 요청 사유를 기록
-- 요구사항 매칭:
-- - 작업허가서 분석 > 관리자 최종 승인 처리
-- - 작업허가서 분석 > 보완 요청 처리

ALTER TABLE work_permits
  ADD COLUMN decision_note TEXT NULL,
  ADD COLUMN decided_by BIGINT NULL,
  ADD COLUMN decided_at TIMESTAMP(6) NULL,
  ADD CONSTRAINT fk_work_permits_decided_by FOREIGN KEY (decided_by) REFERENCES users(id);
