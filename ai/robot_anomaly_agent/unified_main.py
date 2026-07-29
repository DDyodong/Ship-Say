from main import app
from weld_quality import router as weld_quality_router


app.include_router(weld_quality_router)
