package com.example.safetyai.permit.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class TbmMaterialServiceTest {
    @Test
    void extractsEveryLocalizedTbmForPersistence() {
        Map<String, Object> guidance = Map.of(
            "localizedTbm", List.of(
                Map.of("language", "ko", "title", "표준 TBM", "content", "표준 안전 안내"),
                Map.of("language", "uz", "title", "TBM", "content", "Tarjima")
            )
        );

        List<TbmMaterialService.LocalizedMaterial> materials = TbmMaterialService.localizedMaterials(guidance);

        assertThat(materials).containsExactly(
            new TbmMaterialService.LocalizedMaterial("ko", "표준 TBM", "표준 안전 안내"),
            new TbmMaterialService.LocalizedMaterial("uz", "TBM", "Tarjima")
        );
    }
}
