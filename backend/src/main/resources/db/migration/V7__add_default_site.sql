INSERT INTO sites (site_code, name, address)
SELECT 'GEOJE-SMART', '거제 스마트 조선소', '경상남도 거제시'
WHERE NOT EXISTS (
  SELECT 1 FROM sites WHERE site_code = 'GEOJE-SMART'
);
