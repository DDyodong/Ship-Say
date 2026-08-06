package com.example.safetyai.risk.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class SafetyEventRepositoryTest {
    @Mock
    private JdbcTemplate jdbcTemplate;

    private SafetyEventRepository repository;

    @BeforeEach
    void setUp() {
        repository = new SafetyEventRepository(jdbcTemplate);
    }

    @Test
    void repeatedCallbackForSameCheckConvergesOnTheSameEventId() {
        // NOTI-005: 동일 personal-check 콜백이 재전송돼도 안전이벤트는 한 건만 유지되어야 한다.
        // createAiPpeEvent는 INSERT IGNORE 후 ppe_check_id로 조회해 id를 반환하는데,
        // safety_events.uk_safety_events_ppe_check_id 유니크 인덱스(V13 마이그레이션) 덕분에
        // 두 번째 INSERT IGNORE는 실제 DB에서 아무 행도 추가하지 않는다.
        // 이 단위테스트는 "재조회 결과가 항상 같은 기존 행으로 수렴한다"는 저장소의 계약만
        // 고정하며, 유니크 제약이 실제로 중복 삽입을 막는지는 통합 테스트에서 확인해야 한다.
        when(jdbcTemplate.queryForList(
            eq("SELECT id FROM safety_events WHERE ppe_check_id = ?"),
            eq(Long.class),
            eq(31L)
        )).thenReturn(List.of(77L));

        Long first = repository.createAiPpeEvent(31L, "설명", "{}");
        Long second = repository.createAiPpeEvent(31L, "설명", "{}");

        assertThat(first).isEqualTo(77L);
        assertThat(second).isEqualTo(77L);
        verify(jdbcTemplate, times(2)).update(anyString(), eq("설명"), eq("{}"), eq(31L));
    }

    @Test
    void missingPpeCheckRowYieldsNoEvent() {
        when(jdbcTemplate.queryForList(
            eq("SELECT id FROM safety_events WHERE ppe_check_id = ?"),
            eq(Long.class),
            eq(99L)
        )).thenReturn(List.of());

        Long result = repository.createAiPpeEvent(99L, "설명", "{}");

        assertThat(result).isNull();
    }
}
