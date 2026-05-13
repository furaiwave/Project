# Python backend — YOLO inference + training

## Setup (one-time)

```powershell
cd ai-project\backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run the API

```powershell
.venv\Scripts\Activate.ps1
python main.py
# → http://127.0.0.1:8000  (Swagger UI at /docs)
```

## Training a custom model

### Dataset format (YOLO layout)

Pack the following into a single `.zip`:

```
my_dataset/
├── data.yaml          # see below (optional — auto-generated if missing)
├── images/
│   ├── train/*.jpg
│   └── val/*.jpg
└── labels/
    ├── train/*.txt    # one .txt per image, YOLO format
    └── val/*.txt
```

Example `data.yaml`:

```yaml
train: images/train
val: images/val
names: [cat, dog, bird]
nc: 3
```

Each label `.txt` contains one line per object: `class_id cx cy w h` (normalized 0–1).

### Option A — REST API (recommended)

1. **Upload the dataset zip:**
   ```
   POST /train/dataset       (multipart, field: file)
   → { "dataset_id": "abc123..." }
   ```
2. **Start training:**
   ```
   POST /train/start
   { "dataset_id": "abc123...", "epochs": 50, "img_size": 640, "base_model": "yolov8n.pt" }
   → returns a job, status="queued" → "running"
   ```
3. **Poll progress:**
   ```
   GET /train/jobs/{job_id}
   → { "status": "running", "current_epoch": 12, ... }
   ```
4. **Download the trained weights when status="completed":**
   ```
   GET /train/jobs/{job_id}/weights      (returns best.pt)
   ```
5. **(Optional) Swap the live inference model:**
   ```
   POST /train/activate     { "job_id": "..." }
   ```

The Swagger UI at <http://127.0.0.1:8000/docs> lets you click through all of the above.

### Option B — CLI

```powershell
.venv\Scripts\Activate.ps1
python train.py --data my_dataset.zip --epochs 50
python train.py --data path\to\data.yaml --epochs 100 --imgsz 640 --base yolov8s.pt
```

Trained weights end up under `runs/<run_name>/weights/best.pt`.

## Where things live

| Folder       | Contents                                 |
|--------------|------------------------------------------|
| `datasets/`  | Extracted uploaded datasets, by id       |
| `runs/`      | Training output (logs, weights, plots)   |
| `.venv/`     | Python virtualenv (not committed)        |

Both `datasets/` and `runs/` are git-ignored.
