"""YOLO training engine.

Accepts a dataset (YOLO format), starts training in a background thread,
exposes job status, returns path to the trained weights.

Dataset layout expected after unzip:
    <dataset_root>/
        data.yaml              # has `train: ...`, `val: ...`, `names: [...]`
        images/train/*.jpg
        images/val/*.jpg
        labels/train/*.txt
        labels/val/*.txt

If `data.yaml` is missing but `images/train` + `labels/train` exist, a minimal
yaml is generated automatically (single class "object").
"""

from __future__ import annotations

import random
import shutil
import threading
import uuid
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Literal

import yaml
from ultralytics import YOLO

IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

BASE_DIR = Path(__file__).resolve().parent
DATASETS_DIR = BASE_DIR / "datasets"
RUNS_DIR = BASE_DIR / "runs"
DATASETS_DIR.mkdir(exist_ok=True)
RUNS_DIR.mkdir(exist_ok=True)

JobStatus = Literal["queued", "running", "completed", "failed"]


@dataclass
class TrainJob:
    job_id: str
    dataset_id: str
    status: JobStatus = "queued"
    epochs: int = 50
    img_size: int = 640
    base_model: str = "yolov8n.pt"
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    started_at: str | None = None
    finished_at: str | None = None
    current_epoch: int = 0
    error: str | None = None
    weights_path: str | None = None
    metrics: dict | None = None


_JOBS: dict[str, TrainJob] = {}
_JOBS_LOCK = threading.Lock()


def list_jobs() -> list[TrainJob]:
    with _JOBS_LOCK:
        return list(_JOBS.values())


def get_job(job_id: str) -> TrainJob | None:
    with _JOBS_LOCK:
        return _JOBS.get(job_id)


def save_dataset_zip(file_bytes: bytes, original_name: str) -> str:
    """Extract uploaded zip into datasets/<id>/, return dataset_id."""
    dataset_id = uuid.uuid4().hex[:12]
    target = DATASETS_DIR / dataset_id
    target.mkdir(parents=True, exist_ok=True)

    zip_path = target / "_upload.zip"
    zip_path.write_bytes(file_bytes)

    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(target)
    zip_path.unlink(missing_ok=True)

    root = _resolve_dataset_root(target)
    _ensure_data_yaml(root)
    return dataset_id


def register_local_zip(zip_path: str | Path) -> str:
    """Register a zip that already exists on disk — extract into datasets/<id>/.

    Lets users skip HTTP upload for multi-GB archives.
    """
    src = Path(zip_path).expanduser()
    if not src.is_absolute():
        src = src.resolve()
    if not src.exists():
        raise FileNotFoundError(f"File not found: {src}")
    if not src.is_file():
        raise ValueError(f"Not a file: {src}")
    if src.suffix.lower() != ".zip":
        raise ValueError(f"Expected a .zip file, got: {src.suffix}")

    dataset_id = uuid.uuid4().hex[:12]
    target = DATASETS_DIR / dataset_id
    target.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(src) as zf:
        zf.extractall(target)

    root = _resolve_dataset_root(target)
    _ensure_data_yaml(root)
    return dataset_id


def _resolve_dataset_root(extracted_dir: Path) -> Path:
    """If the zip contained a single top-level folder, descend into it."""
    entries = [p for p in extracted_dir.iterdir() if not p.name.startswith("_")]
    if len(entries) == 1 and entries[0].is_dir():
        return entries[0]
    return extracted_dir


def _detect_per_class_folders(root: Path) -> list[Path] | None:
    """Detect `<root>/<classname>/{img.jpg,img.txt}` layout (e.g. African Wildlife)."""
    subdirs = [p for p in root.iterdir() if p.is_dir() and not p.name.startswith(("_", "."))]
    if not subdirs or any(p.name in ("images", "labels") for p in subdirs):
        return None
    for sub in subdirs:
        has_pair = any(
            (sub / f"{img.stem}.txt").exists()
            for img in sub.iterdir()
            if img.suffix.lower() in IMG_EXTS
        )
        if not has_pair:
            return None
    return sorted(subdirs, key=lambda p: p.name.lower())


def _reshape_per_class_to_yolo(root: Path, class_dirs: list[Path], val_split: float = 0.2) -> list[str]:
    """Move per-class .jpg/.txt pairs into images/train|val + labels/train|val.

    Returns the class names (used to fill `data.yaml`).
    """
    img_train = root / "images" / "train"
    img_val = root / "images" / "val"
    lbl_train = root / "labels" / "train"
    lbl_val = root / "labels" / "val"
    for d in (img_train, img_val, lbl_train, lbl_val):
        d.mkdir(parents=True, exist_ok=True)

    rng = random.Random(42)
    class_names: list[str] = []
    for cls_dir in class_dirs:
        class_names.append(cls_dir.name)
        pairs: list[tuple[Path, Path]] = []
        for img in cls_dir.iterdir():
            if img.suffix.lower() not in IMG_EXTS:
                continue
            lbl = cls_dir / f"{img.stem}.txt"
            if lbl.exists():
                pairs.append((img, lbl))

        rng.shuffle(pairs)
        cut = max(1, int(len(pairs) * (1.0 - val_split)))
        for i, (img, lbl) in enumerate(pairs):
            target_img = (img_train if i < cut else img_val) / f"{cls_dir.name}_{img.name}"
            target_lbl = (lbl_train if i < cut else lbl_val) / f"{cls_dir.name}_{lbl.name}"
            shutil.move(str(img), target_img)
            shutil.move(str(lbl), target_lbl)

        # remove empty per-class folder
        try:
            cls_dir.rmdir()
        except OSError:
            pass

    return class_names


def _ensure_data_yaml(root: Path) -> Path:
    """Make sure data.yaml exists and uses absolute paths.

    If the dataset is in a per-class-folders layout (e.g. African Wildlife),
    reshape it into the standard YOLO layout in-place.
    """
    yaml_path = root / "data.yaml"
    if yaml_path.exists():
        cfg = yaml.safe_load(yaml_path.read_text(encoding="utf-8")) or {}
    elif (root / "images" / "train").exists():
        cfg = {
            "train": "images/train",
            "val": "images/val" if (root / "images" / "val").exists() else "images/train",
            "names": ["object"],
            "nc": 1,
        }
    else:
        class_dirs = _detect_per_class_folders(root)
        if not class_dirs:
            raise ValueError(
                "Dataset must contain either data.yaml, "
                "images/train/ + labels/train/, "
                "or per-class subfolders with .jpg/.txt pairs"
            )
        names = _reshape_per_class_to_yolo(root, class_dirs)
        cfg = {
            "train": "images/train",
            "val": "images/val",
            "names": names,
            "nc": len(names),
        }

    cfg["path"] = str(root.resolve())
    yaml_path.write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")
    return yaml_path


def _dataset_yaml(dataset_id: str) -> Path:
    target = DATASETS_DIR / dataset_id
    if not target.exists():
        raise FileNotFoundError(f"Dataset {dataset_id} not found")
    root = _resolve_dataset_root(target)
    return _ensure_data_yaml(root)


def start_training(
    dataset_id: str,
    epochs: int = 50,
    img_size: int = 640,
    base_model: str = "yolov8n.pt",
) -> TrainJob:
    data_yaml = _dataset_yaml(dataset_id)
    job = TrainJob(
        job_id=uuid.uuid4().hex[:12],
        dataset_id=dataset_id,
        epochs=epochs,
        img_size=img_size,
        base_model=base_model,
    )
    with _JOBS_LOCK:
        _JOBS[job.job_id] = job

    thread = threading.Thread(
        target=_run_training, args=(job, data_yaml), daemon=True
    )
    thread.start()
    return job


def _run_training(job: TrainJob, data_yaml: Path) -> None:
    job.status = "running"
    job.started_at = datetime.utcnow().isoformat()
    run_dir = RUNS_DIR / job.job_id
    try:
        model = YOLO(job.base_model)

        def on_epoch_end(trainer):
            job.current_epoch = int(getattr(trainer, "epoch", job.current_epoch) + 1)

        model.add_callback("on_train_epoch_end", on_epoch_end)

        results = model.train(
            data=str(data_yaml),
            epochs=job.epochs,
            imgsz=job.img_size,
            project=str(RUNS_DIR),
            name=job.job_id,
            exist_ok=True,
            verbose=False,
        )

        best = run_dir / "weights" / "best.pt"
        last = run_dir / "weights" / "last.pt"
        chosen = best if best.exists() else last
        if not chosen.exists():
            raise RuntimeError("Training finished but no weights file was produced")

        job.weights_path = str(chosen.resolve())
        job.metrics = _extract_metrics(results)
        job.status = "completed"
    except Exception as exc:
        job.status = "failed"
        job.error = f"{type(exc).__name__}: {exc}"
    finally:
        job.finished_at = datetime.utcnow().isoformat()


def _extract_metrics(results) -> dict:
    try:
        rd = getattr(results, "results_dict", None)
        if isinstance(rd, dict):
            return {k: float(v) for k, v in rd.items() if isinstance(v, (int, float))}
    except Exception:
        pass
    return {}


def delete_dataset(dataset_id: str) -> bool:
    target = DATASETS_DIR / dataset_id
    if not target.exists():
        return False
    shutil.rmtree(target, ignore_errors=True)
    return True
