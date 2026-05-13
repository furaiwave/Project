from pathlib import Path
import io
import time
import uuid

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image
from pydantic import BaseModel, Field
from ultralytics import YOLO

import training

app = FastAPI(title="YOLOv8 Detection + Training Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_MODEL = "yolov8n.pt"
_active_model_path: str = DEFAULT_MODEL
model = YOLO(DEFAULT_MODEL)


class BBoxItem(BaseModel):
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: list[float] = Field(min_length=4, max_length=4)


class InferrenceResponse(BaseModel):
    job_id: str
    objects: list[BBoxItem]
    inference_ms: float


@app.post("/infer", response_model=InferrenceResponse)
async def infer(file: UploadFile = File(...)) -> InferrenceResponse:
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=422, detail="INVALID_IMAGE")

    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")

    t0 = time.perf_counter()
    results = model(image, verbose=False)[0]
    elapsed = (time.perf_counter() - t0) * 1000

    objects: list[BBoxItem] = []
    for box in results.boxes:
        x, y, w, h = box.xywh[0].tolist()
        objects.append(BBoxItem(
            label=results.names[int(box.cls)],
            confidence=round(float(box.conf), 4),
            bbox=[round(v, 2) for v in [x, y, w, h]],
        ))

    return InferrenceResponse(
        job_id=str(uuid.uuid4()),
        objects=objects,
        inference_ms=round(elapsed, 2),
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": _active_model_path}


# ── Training endpoints ─────────────────────────────────────────────


class DatasetUploadResponse(BaseModel):
    dataset_id: str


class TrainStartRequest(BaseModel):
    dataset_id: str
    epochs: int = Field(default=50, ge=1, le=1000)
    img_size: int = Field(default=640, ge=64, le=2048)
    base_model: str = "yolov8n.pt"


class TrainJobResponse(BaseModel):
    job_id: str
    dataset_id: str
    status: str
    epochs: int
    current_epoch: int
    img_size: int
    base_model: str
    created_at: str
    started_at: str | None
    finished_at: str | None
    error: str | None
    weights_path: str | None
    metrics: dict | None


def _job_to_response(job: training.TrainJob) -> TrainJobResponse:
    return TrainJobResponse(
        job_id=job.job_id,
        dataset_id=job.dataset_id,
        status=job.status,
        epochs=job.epochs,
        current_epoch=job.current_epoch,
        img_size=job.img_size,
        base_model=job.base_model,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
        error=job.error,
        weights_path=job.weights_path,
        metrics=job.metrics,
    )


@app.post("/train/dataset", response_model=DatasetUploadResponse)
async def upload_dataset(file: UploadFile = File(...)) -> DatasetUploadResponse:
    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(status_code=422, detail="Dataset must be a .zip file")
    contents = await file.read()
    try:
        dataset_id = training.save_dataset_zip(contents, file.filename or "dataset.zip")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return DatasetUploadResponse(dataset_id=dataset_id)


@app.post("/train/start", response_model=TrainJobResponse)
def train_start(req: TrainStartRequest) -> TrainJobResponse:
    try:
        job = training.start_training(
            dataset_id=req.dataset_id,
            epochs=req.epochs,
            img_size=req.img_size,
            base_model=req.base_model,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _job_to_response(job)


@app.get("/train/jobs", response_model=list[TrainJobResponse])
def train_list() -> list[TrainJobResponse]:
    return [_job_to_response(j) for j in training.list_jobs()]


@app.get("/train/jobs/{job_id}", response_model=TrainJobResponse)
def train_status(job_id: str) -> TrainJobResponse:
    job = training.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_response(job)


@app.get("/train/jobs/{job_id}/weights")
def train_download_weights(job_id: str):
    job = training.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "completed" or not job.weights_path:
        raise HTTPException(status_code=409, detail=f"Job not ready (status={job.status})")
    path = Path(job.weights_path)
    if not path.exists():
        raise HTTPException(status_code=410, detail="Weights file missing on disk")
    return FileResponse(path, filename=f"{job_id}.pt", media_type="application/octet-stream")


class ActivateRequest(BaseModel):
    job_id: str | None = None
    weights_path: str | None = None


@app.post("/train/activate")
def train_activate(req: ActivateRequest) -> dict[str, str]:
    """Swap the currently-loaded model for a freshly-trained one."""
    global model, _active_model_path

    path: str | None = req.weights_path
    if req.job_id and not path:
        job = training.get_job(req.job_id)
        if not job or not job.weights_path:
            raise HTTPException(status_code=404, detail="Job/weights not found")
        path = job.weights_path

    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="Weights file not found")

    model = YOLO(path)
    _active_model_path = path
    return {"status": "ok", "active_model": path}


if __name__ == "__main__":
    import os
    import uvicorn
    reload = os.environ.get("RELOAD", "0") == "1"
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=reload)
