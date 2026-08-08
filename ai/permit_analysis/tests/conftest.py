# -*- coding: utf-8 -*-
"""pytest 공유 설정. 이 파일은 pytest가 자동으로 인식한다(이름 고정)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from permit_engine import load_rules, load_matrix

# 실제 샘플 PDF들이 있는 폴더. 없으면 그 테스트만 자동으로 건너뛴다(skip).
SAMPLE_DIR = Path(__file__).parent.parent / "samples"


@pytest.fixture(scope="session")
def rules():
    return load_rules()


@pytest.fixture(scope="session")
def matrix():
    return load_matrix()


def sample_path(filename):
    """샘플 PDF 경로. 없으면 pytest.skip으로 그 테스트만 건너뛴다."""
    p = SAMPLE_DIR / filename
    if not p.exists():
        pytest.skip(f"샘플 파일 없음: {p} (samples/ 폴더에 PDF를 넣어주세요)")
    return p