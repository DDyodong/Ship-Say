-- 작업허가서의 보충작업 유형을 여러 개 저장한다.
ALTER TABLE work_permits
  ADD COLUMN supplementary_work JSON NOT NULL DEFAULT (JSON_ARRAY());
