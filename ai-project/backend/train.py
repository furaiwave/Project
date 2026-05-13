"""CLI for training a YOLO model on a local dataset.

Usage:
    python train.py --data path/to/data.yaml --epochs 50
    python train.py --data path/to/dataset.zip --epochs 100 --imgsz 640
    python train.py --data path/to/dataset_folder --base yolov8s.pt
"""

from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path

from ultralytics import YOLO

import training


def _prepare_data_arg(data_arg: str) -> Path:
    """Accept a .yaml, a folder, or a .zip and return the data.yaml path."""
    p = Path(data_arg).expanduser().resolve()
    if not p.exists():
        raise FileNotFoundError(f"Path not found: {p}")

    if p.is_file() and p.suffix.lower() == ".yaml":
        return p

    if p.is_file() and p.suffix.lower() == ".zip":
        dataset_id = training.save_dataset_zip(p.read_bytes(), p.name)
        return training._dataset_yaml(dataset_id)

    if p.is_dir():
        return training._ensure_data_yaml(p)

    raise ValueError(f"Unsupported --data target: {p}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Train a YOLO model")
    parser.add_argument("--data", required=True, help=".yaml file, dataset folder, or .zip archive")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--base", default="yolov8n.pt", help="Base model checkpoint")
    parser.add_argument("--name", default=None, help="Run name (defaults to a timestamp)")
    args = parser.parse_args()

    data_yaml = _prepare_data_arg(args.data)
    print(f"[train] data.yaml -> {data_yaml}")

    model = YOLO(args.base)
    results = model.train(
        data=str(data_yaml),
        epochs=args.epochs,
        imgsz=args.imgsz,
        project=str(training.RUNS_DIR),
        name=args.name,
        exist_ok=True,
    )

    save_dir = Path(getattr(results, "save_dir", training.RUNS_DIR / (args.name or "train")))
    best = save_dir / "weights" / "best.pt"
    print(f"[train] done. best weights: {best if best.exists() else '(not produced)'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
