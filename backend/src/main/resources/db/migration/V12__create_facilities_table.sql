CREATE TABLE facilities (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    code          VARCHAR(50)  NOT NULL UNIQUE,
    name          VARCHAR(100) NOT NULL,
    type          ENUM('FABRICATION','ASSEMBLY','PAINTING','OUTFITTING','DOCK','QUAY') NOT NULL,
    lat           DECIMAL(10, 7) NOT NULL,
    lng           DECIMAL(10, 7) NOT NULL,
    risk_level    ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'LOW',
    progress      TINYINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO facilities (code, name, type, lat, lng, risk_level, progress) VALUES
('CUTTING-SHOP', '강재 절단공장', 'FABRICATION', 0, 0, 'LOW', 74),
('CURVED-BLOCK', '곡블록 가공공장', 'FABRICATION', 0, 0, 'LOW', 64),
('T-BAR-SHOP', 'T-BAR 자동용접 SHOP', 'FABRICATION', 0, 0, 'CRITICAL', 63),
('ASSEMBLY-01', '블록 조립 1공장', 'ASSEMBLY', 0, 0, 'LOW', 88),
('ASSEMBLY-02', '블록 조립 2공장', 'ASSEMBLY', 0, 0, 'LOW', 49),
('SPECIAL-SHOP', '특수선 건조공장', 'ASSEMBLY', 0, 0, 'LOW', 55),
('OFFSHORE-SHOP', '해양플랜트 공장', 'ASSEMBLY', 0, 0, 'MEDIUM', 41),
('PAINT-01', '도장 1공장', 'PAINTING', 0, 0, 'LOW', 69),
('PAINT-02', '도장 2공장', 'PAINTING', 0, 0, 'MEDIUM', 43),
('OUTFIT-SHOP', '의장 공장', 'OUTFITTING', 0, 0, 'LOW', 76),
('DOCK-01', '제1도크', 'DOCK', 0, 0, 'LOW', 82),
('DOCK-02', '제2도크', 'DOCK', 0, 0, 'LOW', 76),
('FDOCK-03', '부유식도크 RD-3', 'DOCK', 0, 0, 'LOW', 91),
('FDOCK-04', '부유식도크 RD-4', 'DOCK', 0, 0, 'MEDIUM', 58),
('FDOCK-05', '부유식도크 RD-5', 'DOCK', 0, 0, 'LOW', 69),
('QUAY-01', '안벽 1구역', 'QUAY', 0, 0, 'LOW', 94);

-- 나머지 15개도 같은 형식으로 추가, lat/lng는 처음엔 0으로 두고
-- "좌표 보정" 화면에서 채워넣는 방식