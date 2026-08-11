DELETE older
  FROM tbm_materials older
  JOIN tbm_materials newer
    ON newer.tbm_session_id = older.tbm_session_id
   AND newer.material_type = older.material_type
   AND newer.language = older.language
   AND newer.id > older.id;

ALTER TABLE tbm_materials
  ADD CONSTRAINT ux_tbm_materials_session_type_language
  UNIQUE (tbm_session_id, material_type, language);
