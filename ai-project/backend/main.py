from fastapi import FastAPI, UploadFile, File, HTTPException
from ultralytics import YOLO
from pydantic import BaseModel, Field
import uuid, time, io
from PIL import Image

app = FastAPI(title="YOLOv8 DETECTION Service")

# Модель завантажується один раз при старті
model = YOLO("yolov8n.pt")

class BBoxItem(BaseModel):
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: list[float] = Field(min_length=4, max_length=4) # [x,y,w,h]

class InferrenceResponse(BaseModel):
    job_id: str
    objects: list[BBoxItem]
    inference_ms: float

@app.post("/infer", response_model=InferrenceResponse)
async def infer(file: UploadFile = File(...)) -> InferrenceResponse:
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=422, detail="INVELID_IMAGE")

    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")

    t0 = time.perf_counter()
    results = model(image, verbose=False)[0]
    elapsed = (time.perf_counter() - t0) * 1000

    objects: list[BBoxItem] = []
    for box in results.boxes: 
        x, y, w, h = box.xywh[0].tolist()
        objects.append(BBoxItem(
            label = results.names[int(box.cls)],
            confidence = round(float(box.conf), 4),
            bbox = [round(v, 2) for v in [x, y, w, h]],
        ))

    return InferrenceResponse(
        job_id = str(uuid.uuid4()),
        objects = objects,
        inference_ms = round(elapsed, 2),
    )

@app.get("/health")
def health() -> dict[str, str]:
    return { "status": "ok", "model": "yolov8n" }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", port=8000, reload=True)