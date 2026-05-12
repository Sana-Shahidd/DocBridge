# SynthShield — Quantum Deepfake & Misinformation Shield

SynthShield detects fake images, videos, and audio using a multi-module AI pipeline
and generates cryptographically-signed forensic reports — all running locally.

## Architecture

```
synth_shield/
├── backend/        FastAPI — detection pipeline + REST API
└── frontend/       Vite + React — upload, results, reports, dashboard
```

## Modules

| Module | Description |
|---|---|
| Media Ingestion & Validation | Type/size/integrity checks before analysis |
| QSAM Engine | Quantum-inspired spectral anomaly mapping |
| CNN Classifier | Deep learning image/video frame classifier |
| Audio Analyzer | Voice clone & splice detection |
| Metadata Verifier | EXIF forensics & tamper detection |
| News Verifier | Claim cross-reference against fact-check APIs |
| Score Engine | Weighted aggregate verdict (authentic / suspicious / fake) |
| Certificate Generator | PDF forensic certificate with QR + SHA-256 fingerprint |
| Pattern Matcher | Known GAN watermark & synthetic signature detection |

## Quick Start

### Backend

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env   # edit as needed
uvicorn main:app --reload
```

API docs available at http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App available at http://localhost:5173

## Requirements

- Python 3.11+
- Node.js 18+
- (Optional) CUDA-capable GPU for faster model inference
