INSERT INTO twin_assets
  (facility_id, asset_code, name, asset_type, model_name, status, position_x, position_y, position_z, metadata)
SELECT id, 'RB-WELD-03', '용접 로봇 3호기', 'WELDING_ROBOT', 'AR2010 representative', 'running', 34, 42, 2,
       JSON_OBJECT('cell', 'CELL-B1', 'controller', 'YRC1000-compatible adapter', 'dataMode', 'SIMULATOR')
FROM twin_facilities WHERE facility_code = 'T-BAR-SHOP'
ON DUPLICATE KEY UPDATE name = VALUES(name), model_name = VALUES(model_name), metadata = VALUES(metadata);
INSERT INTO twin_assets
  (facility_id, asset_code, name, asset_type, model_name, status, position_x, position_y, position_z, metadata)
SELECT id, 'RB-WELD-04', '용접 로봇 4호기', 'WELDING_ROBOT', 'AR2010 representative', 'running', 58, 42, 2,
       JSON_OBJECT('cell', 'CELL-B2', 'controller', 'YRC1000-compatible adapter', 'dataMode', 'SIMULATOR')
FROM twin_facilities WHERE facility_code = 'T-BAR-SHOP'
ON DUPLICATE KEY UPDATE name = VALUES(name), model_name = VALUES(model_name), metadata = VALUES(metadata);
INSERT INTO twin_assets
  (facility_id, asset_code, name, asset_type, model_name, status, position_x, position_y, position_z, metadata)
SELECT id, 'RB-WELD-05', '용접 로봇 5호기', 'WELDING_ROBOT', 'AR1440 representative', 'running', 36, 42, 1,
       JSON_OBJECT('cell', 'CELL-C1', 'controller', 'YRC1000-compatible adapter', 'dataMode', 'SIMULATOR')
FROM twin_facilities WHERE facility_code = 'T-BAR-SHOP'
ON DUPLICATE KEY UPDATE name = VALUES(name), model_name = VALUES(model_name), metadata = VALUES(metadata);

INSERT INTO twin_assets
  (facility_id, asset_code, name, asset_type, model_name, status, position_x, position_y, position_z, metadata)
SELECT id, 'RB-WELD-06', '용접 로봇 6호기', 'WELDING_ROBOT', 'AR1440 representative', 'standby', 60, 42, 1,
       JSON_OBJECT('cell', 'CELL-C2', 'controller', 'YRC1000-compatible adapter', 'dataMode', 'SIMULATOR')
FROM twin_facilities WHERE facility_code = 'T-BAR-SHOP'
ON DUPLICATE KEY UPDATE name = VALUES(name), model_name = VALUES(model_name), metadata = VALUES(metadata);
-- End of T-BAR SHOP robot-cell expansion.

