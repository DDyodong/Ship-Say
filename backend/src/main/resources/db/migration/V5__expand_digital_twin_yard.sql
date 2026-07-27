UPDATE twin_facilities SET map_x = 7,  map_y = 12, map_width = 15, map_height = 9  WHERE facility_code = 'T-BAR-SHOP';
UPDATE twin_facilities SET map_x = 25, map_y = 12, map_width = 16, map_height = 10 WHERE facility_code = 'ASSEMBLY-01';
UPDATE twin_facilities SET map_x = 64, map_y = 13, map_width = 12, map_height = 9  WHERE facility_code = 'PAINT-02';
UPDATE twin_facilities SET map_x = 31, map_y = 60, map_width = 23, map_height = 15 WHERE facility_code = 'DOCK-01';

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'PANEL-LINE', '판넬 생산 라인', 'FABRICATION', 'running', 'low', 76, 7, 27, 14, 9
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'CURVED-BLOCK', '곡블록 가공 공장', 'FABRICATION', 'running', 'low', 64, 24, 27, 15, 9
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'PIPE-SHOP', '배관 제작 SHOP', 'OUTFITTING', 'running', 'low', 71, 43, 12, 13, 9
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'PRE-OUTFIT', '선행 의장 공장', 'OUTFITTING', 'running', 'low', 58, 59, 28, 15, 10
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'ASSEMBLY-02', '블록 조립 2공장', 'ASSEMBLY', 'running', 'low', 49, 43, 42, 16, 10
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'BLAST-01', '블라스팅 1공장', 'PAINTING', 'running', 'low', 87, 61, 26, 12, 9
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'PAINT-01', '도장 1공장', 'PAINTING', 'running', 'low', 69, 77, 14, 12, 9
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'ENGINE-SHOP', '엔진 조립 공장', 'MACHINERY', 'running', 'low', 53, 78, 28, 14, 10
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'MATERIAL-YARD', '강재 적치장', 'STORAGE', 'running', 'low', 91, 7, 43, 14, 11
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'DOCK-02', '제2 건조 도크', 'DOCK', 'running', 'low', 37, 57, 61, 20, 14
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'DOCK-03', '제3 건조 도크', 'DOCK', 'running', 'low', 22, 80, 62, 15, 13
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'OUTFIT-QUAY', '의장 안벽', 'QUAY', 'running', 'low', 45, 66, 79, 16, 9
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);
