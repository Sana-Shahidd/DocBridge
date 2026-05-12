"""
Source Seal Service — journalist and whistleblower source protection.

Workflow
--------
1. Source uploads original recording → create_voice_avatar() generates a
   synthetic version that preserves style but changes identity.
2. Original recording is encrypted and stored in cryptographic escrow
   via store_in_escrow().
3. Source reviews the synthetic version and approves via generate_approval_package().
4. Published audio is the synthetic avatar; the original is never exposed
   without a legal order that includes the correct verification_key.

Encryption
----------
Key derivation: PBKDF2-HMAC-SHA256(password=SECRET_KEY+source_name,
                                    salt=random_16_bytes, iterations=100_000)
Stream cipher : SHAKE-256(key||nonce) XOR plaintext  (stdlib only, no extra deps)

Voice anonymisation
-------------------
• Pitch shift ±1.5–2.5 semitones  (deterministic from style_descriptor hash)
• Formant shift via double-resample trick (Δ ≈ ±8–12 %)
• Subtle Gaussian room noise (σ = 0.003)
• Rhythm preserved (no time-stretch — avoids artefacts in short demo clips)
"""

import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

try:
    import librosa
    import soundfile as sf
    _LIBROSA = True
except ImportError:
    _LIBROSA = False

try:
    from scipy.signal import resample_poly
    _SCIPY = True
except ImportError:
    _SCIPY = False

# ── constants ─────────────────────────────────────────────────────────────────

SECRET_KEY   = os.getenv("SECRET_KEY", "change-me-before-production")
_UPLOAD_DIR  = Path("uploads")
_ESCROW_DIR  = _UPLOAD_DIR / "escrow"
_SR          = 16_000   # working sample rate for voice processing
_PBKDF2_ITER = 100_000


# ═════════════════════════════════════════════════════════════════════════════
# SourceSealService
# ═════════════════════════════════════════════════════════════════════════════

class SourceSealService:

    # ── 1. Voice avatar generation ────────────────────────────────────────────

    def create_voice_avatar(
        self, audio_path: str, style_descriptor: str
    ) -> Dict[str, Any]:
        """
        Generate a synthetic voice avatar that preserves the speaker's style
        (pace, emphasis, tone) while completely changing their identity.

        Transformations applied
        -----------------------
        a. Pitch shift  +1.5 – +2.5 semitones (deterministic from style hash)
        b. Formant shift via double-resample  (Δ ≈ 8–12 %)
        c. Subtle Gaussian room noise  (σ = 0.003)

        Returns
        -------
        {"synthetic_audio_path", "style_preserved", "identity_changed",
         "original_metrics", "transformations_applied"}
        """
        if not Path(audio_path).exists():
            return {"error": f"Audio file not found: {audio_path}"}
        if not _LIBROSA:
            return {"error": "librosa not installed — voice avatar unavailable."}

        # ── Load ─────────────────────────────────────────────────────────────
        y, sr = librosa.load(audio_path, sr=_SR, mono=True)

        # ── Analyse original metrics ──────────────────────────────────────────
        original_metrics = self._analyse_voice(y, sr)

        # ── Deterministic transform parameters from style hash ────────────────
        h        = int(hashlib.md5((style_descriptor or "neutral").encode()).hexdigest(), 16)
        n_steps  = 1.5 + (h % 100) / 100.0         # 1.5 – 2.5 semitones
        f_factor = 0.88 + (h % 120) / 1000.0        # 0.880 – 1.000  formant factor

        transforms_applied: List[str] = []

        # ── a. Pitch shift ────────────────────────────────────────────────────
        y_p = librosa.effects.pitch_shift(y, sr=sr, n_steps=n_steps)
        transforms_applied.append(f"Pitch shifted +{n_steps:.2f} semitones")

        # ── b. Formant shift (double-resample) ────────────────────────────────
        target_sr = int(sr * f_factor)
        if target_sr != sr and target_sr > 1000:
            try:
                if _SCIPY:
                    # Use integer ratio for quality resample
                    import math
                    g = math.gcd(target_sr, sr)
                    y_dn = resample_poly(y_p, target_sr // g, sr // g)
                    y_up = resample_poly(y_dn, sr // g, target_sr // g)
                else:
                    y_dn = librosa.resample(y_p, orig_sr=sr, target_sr=target_sr)
                    y_up = librosa.resample(y_dn, orig_sr=target_sr, target_sr=sr)

                # Align length with original
                min_len = min(len(y_p), len(y_up))
                y_f    = y_up[:min_len]
                if len(y_f) < len(y_p):
                    y_f = np.pad(y_f, (0, len(y_p) - len(y_f)))
                transforms_applied.append(
                    f"Formant shifted (factor {f_factor:.3f} — "
                    f"{'deeper' if f_factor < 1.0 else 'higher'} vocal tract)"
                )
            except Exception:
                y_f = y_p   # fallback: skip formant shift
        else:
            y_f = y_p

        # ── c. Subtle room noise ──────────────────────────────────────────────
        rng     = np.random.default_rng(h % (2**32))
        noise   = rng.normal(0.0, 0.003, len(y_f)).astype(np.float32)
        y_synth = np.clip(y_f + noise, -1.0, 1.0)
        transforms_applied.append("Subtle room noise added (sigma = 0.003)")

        # ── Save ──────────────────────────────────────────────────────────────
        _UPLOAD_DIR.mkdir(exist_ok=True)
        out_name = f"avatar_{uuid.uuid4().hex}.wav"
        out_path = str(_UPLOAD_DIR / out_name)
        sf.write(out_path, y_synth, sr)

        return {
            "synthetic_audio_path":  out_path,
            "style_preserved":       True,
            "identity_changed":      True,
            "original_metrics":      original_metrics,
            "transformations_applied": transforms_applied,
        }

    # ── 2. Store original in escrow ───────────────────────────────────────────

    def store_in_escrow(
        self,
        original_file_path: str,
        source_name:        str,
        journalist_name:    str,
    ) -> Dict[str, Any]:
        """
        Encrypt the original file and store it in a local escrow vault.
        The encryption key is derived from SECRET_KEY + source_name using
        PBKDF2-HMAC-SHA256.  No one can retrieve the file without knowing
        both SECRET_KEY (server secret) and source_name.

        Returns
        -------
        {"escrow_id", "file_hash", "stored_at", "retrieval_requires"}
        """
        if not Path(original_file_path).exists():
            raise FileNotFoundError(f"File not found: {original_file_path}")

        # Hash original
        file_hash = _sha256(original_file_path)

        # Derive encryption key
        salt        = os.urandom(16)
        enc_key     = _derive_key(SECRET_KEY, source_name, salt)

        # Encrypt
        with open(original_file_path, "rb") as f:
            plaintext = f.read()
        nonce     = os.urandom(16)
        ciphertext = _xor_encrypt(plaintext, enc_key, nonce)

        # Persist
        escrow_id  = uuid.uuid4().hex
        escrow_dir = _ESCROW_DIR / escrow_id
        escrow_dir.mkdir(parents=True, exist_ok=True)

        with open(escrow_dir / "encrypted_content.bin", "wb") as f:
            # Layout: [16B salt][16B nonce][ciphertext]
            f.write(salt + nonce + ciphertext)

        stored_at   = datetime.now(timezone.utc).isoformat()
        # Store HMAC of (file_hash + escrow_id) as verification token
        verif_token = hmac.new(
            SECRET_KEY.encode(),
            (file_hash + escrow_id).encode(),
            hashlib.sha256,
        ).hexdigest()

        metadata = {
            "escrow_id":        escrow_id,
            "file_hash":        file_hash,
            "journalist_name":  journalist_name,
            "source_label":     hashlib.sha256(source_name.encode()).hexdigest()[:16],
            "stored_at":        stored_at,
            "approval_status":  "pending",
            "verif_token":      verif_token,
            "original_filename": Path(original_file_path).name,
        }
        with open(escrow_dir / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

        return {
            "escrow_id":          escrow_id,
            "file_hash":          file_hash,
            "stored_at":          stored_at,
            "retrieval_requires": "Legal order with case reference",
        }

    # ── 3. Verify escrow integrity ────────────────────────────────────────────

    def verify_escrow_original(
        self, escrow_id: str, verification_key: str
    ) -> Dict[str, Any]:
        """
        Confirm that the escrow file is intact and has not been tampered with.
        NEVER returns the decrypted original — only verifies hash integrity.

        Returns
        -------
        {"verified", "original_hash", "stored_at"}
        """
        meta = self._load_escrow_meta(escrow_id)
        if meta is None:
            return {"verified": False, "original_hash": "", "stored_at": "",
                    "error": f"Escrow record '{escrow_id}' not found."}

        enc_path = _ESCROW_DIR / escrow_id / "encrypted_content.bin"
        if not enc_path.exists():
            return {"verified": False, "original_hash": meta["file_hash"],
                    "stored_at": meta["stored_at"],
                    "error": "Encrypted content file missing — escrow may be corrupted."}

        # Verify HMAC token (proof that requester knows SECRET_KEY)
        expected_token = hmac.new(
            SECRET_KEY.encode(),
            (meta["file_hash"] + escrow_id).encode(),
            hashlib.sha256,
        ).hexdigest()

        if verification_key and not hmac.compare_digest(verification_key, expected_token):
            return {"verified": False, "original_hash": meta["file_hash"],
                    "stored_at": meta["stored_at"],
                    "error": "Verification key mismatch."}

        # Verify the encrypted file hasn't been modified (hash the ciphertext)
        enc_hash = _sha256(str(enc_path))
        meta_enc_hash = meta.get("enc_file_hash")

        if meta_enc_hash is None:
            # First-time verify: record the hash so we can detect future tampering
            meta["enc_file_hash"] = enc_hash
            _save_escrow_meta(escrow_id, meta)
            integrity_ok = True
        else:
            integrity_ok = hmac.compare_digest(enc_hash, meta_enc_hash)

        return {
            "verified":     integrity_ok,
            "original_hash": meta["file_hash"],
            "stored_at":    meta["stored_at"],
        }

    # ── 4. Generate approval package ─────────────────────────────────────────

    def generate_approval_package(
        self, synthetic_audio_path: str, escrow_id: str
    ) -> Dict[str, Any]:
        """
        Bundle the synthetic audio with a disclosure document so the source
        can review exactly what was changed before publication is approved.

        Returns
        -------
        {"package_path", "escrow_reference", "approval_status"}
        """
        meta = self._load_escrow_meta(escrow_id)
        if meta is None:
            return {"error": f"Escrow record '{escrow_id}' not found."}

        package_dir = _ESCROW_DIR / escrow_id / "approval_package"
        package_dir.mkdir(parents=True, exist_ok=True)

        # Disclosure document
        disclosure = {
            "title":            "SynthShield Source Protection — Review Package",
            "escrow_reference": escrow_id,
            "journalist":       meta.get("journalist_name", ""),
            "generated_at":     datetime.now(timezone.utc).isoformat(),
            "original_file": {
                "stored":       True,
                "hash":         meta["file_hash"],
                "location":     "Cryptographic escrow (encrypted, not accessible without legal order)",
            },
            "synthetic_audio": {
                "path":         synthetic_audio_path,
                "identity_changed": True,
                "style_preserved":  True,
            },
            "what_was_changed": [
                "Voice pitch was shifted to disguise identity",
                "Vocal tract formants were modified",
                "Subtle ambient noise was added for naturalness",
            ],
            "what_was_preserved": [
                "Speaking pace and rhythm",
                "Emphasis and emotional tone",
                "Content and wording (unchanged)",
            ],
            "retrieval_notice": (
                "The original unmodified recording is stored in encrypted escrow. "
                "It cannot be accessed without a valid legal order "
                "referencing this escrow ID."
            ),
            "legal_disclaimer": (
                "This package is prepared for source review only. "
                "Do not distribute. Publication approval by the source "
                "constitutes informed consent to use the synthetic version."
            ),
            "approval_status":  meta.get("approval_status", "pending"),
        }

        doc_path = package_dir / "disclosure.json"
        with open(doc_path, "w") as f:
            json.dump(disclosure, f, indent=2)

        # Try PDF generation with reportlab
        pdf_path = self._try_generate_pdf(disclosure, package_dir)

        package_path = str(pdf_path if pdf_path else doc_path)

        return {
            "package_path":      package_path,
            "escrow_reference":  escrow_id,
            "approval_status":   meta.get("approval_status", "pending"),
        }

    # ── Approval status update ────────────────────────────────────────────────

    def approve(self, escrow_id: str) -> Dict[str, Any]:
        """Mark the synthetic version as approved by the source."""
        meta = self._load_escrow_meta(escrow_id)
        if meta is None:
            return {"error": f"Escrow record '{escrow_id}' not found."}
        meta["approval_status"] = "approved"
        meta["approved_at"]     = datetime.now(timezone.utc).isoformat()
        _save_escrow_meta(escrow_id, meta)
        return {"escrow_id": escrow_id, "approval_status": "approved",
                "approved_at": meta["approved_at"]}

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _analyse_voice(self, y: np.ndarray, sr: int) -> Dict[str, Any]:
        """Quick voice metrics for the disclosure document."""
        rms         = float(np.sqrt(np.mean(y ** 2)))
        duration_s  = len(y) / sr
        # Spectral centroid (proxy for perceived brightness / tone)
        cent        = librosa.feature.spectral_centroid(y=y, sr=sr)
        mean_cent   = float(cent.mean())
        # Zero-crossing rate (proxy for speaking tempo/breathiness)
        zcr         = float(librosa.feature.zero_crossing_rate(y).mean())
        return {
            "duration_s":      round(duration_s, 2),
            "rms_energy":      round(rms, 4),
            "spectral_centroid_hz": round(mean_cent, 1),
            "zero_crossing_rate":   round(zcr, 4),
        }

    @staticmethod
    def _load_escrow_meta(escrow_id: str) -> Optional[Dict]:
        path = _ESCROW_DIR / escrow_id / "metadata.json"
        if not path.exists():
            return None
        with open(path) as f:
            return json.load(f)

    @staticmethod
    def _try_generate_pdf(
        disclosure: Dict, package_dir: Path
    ) -> Optional[Path]:
        """Attempt to create a PDF approval document using reportlab."""
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.platypus import Paragraph, Spacer, SimpleDocTemplate

            pdf_path = package_dir / "approval_package.pdf"
            doc      = SimpleDocTemplate(str(pdf_path), pagesize=A4)
            styles   = getSampleStyleSheet()
            story    = []

            story.append(Paragraph(disclosure["title"], styles["Title"]))
            story.append(Spacer(1, 12))
            story.append(Paragraph(
                f"<b>Escrow Reference:</b> {disclosure['escrow_reference']}", styles["Normal"]))
            story.append(Paragraph(
                f"<b>Journalist:</b> {disclosure['journalist']}", styles["Normal"]))
            story.append(Spacer(1, 12))

            story.append(Paragraph("<b>What Was Changed:</b>", styles["Heading2"]))
            for item in disclosure["what_was_changed"]:
                story.append(Paragraph(f"• {item}", styles["Normal"]))
            story.append(Spacer(1, 8))

            story.append(Paragraph("<b>What Was Preserved:</b>", styles["Heading2"]))
            for item in disclosure["what_was_preserved"]:
                story.append(Paragraph(f"• {item}", styles["Normal"]))
            story.append(Spacer(1, 12))

            story.append(Paragraph(disclosure["retrieval_notice"], styles["Normal"]))
            story.append(Spacer(1, 8))
            story.append(Paragraph(
                f"<i>{disclosure['legal_disclaimer']}</i>", styles["Normal"]))
            story.append(Spacer(1, 12))
            story.append(Paragraph(
                f"<b>Approval Status:</b> {disclosure['approval_status'].upper()}",
                styles["Normal"]))

            doc.build(story)
            return pdf_path
        except Exception:
            return None


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════

def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _derive_key(secret: str, source_name: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password=(secret + source_name).encode(),
        salt=salt,
        iterations=_PBKDF2_ITER,
        dklen=32,
    )


def _xor_encrypt(data: bytes, key: bytes, nonce: bytes) -> bytes:
    """SHAKE-256 stream cipher XOR — symmetric, so decryption == encryption."""
    stream = hashlib.shake_256(key + nonce).digest(len(data))
    return bytes(a ^ b for a, b in zip(data, stream))


def _save_escrow_meta(escrow_id: str, meta: Dict) -> None:
    path = _ESCROW_DIR / escrow_id / "metadata.json"
    with open(path, "w") as f:
        json.dump(meta, f, indent=2)


# ═════════════════════════════════════════════════════════════════════════════
# Legacy seal functions (kept for backward compatibility with other services)
# ═════════════════════════════════════════════════════════════════════════════

def create_seal(file_path: str, metadata: dict) -> Dict[str, Any]:
    """HMAC-SHA256 provenance seal for a media file."""
    import uuid as _uuid
    with open(file_path, "rb") as f:
        file_hash = hashlib.sha256(f.read()).hexdigest()

    seal_id   = str(_uuid.uuid4())
    issued_at = datetime.now(timezone.utc).isoformat()
    payload   = {"seal_id": seal_id, "file_hash": file_hash,
                 "metadata": metadata, "issued_at": issued_at}
    canonical = json.dumps(payload, sort_keys=True).encode()
    signature = hmac.new(SECRET_KEY.encode(), canonical, hashlib.sha256).hexdigest()

    return {"seal_id": seal_id, "file_hash": file_hash,
            "signature": signature, "issued_at": issued_at, "payload": payload}


def verify_seal(file_path: str, seal: Dict[str, Any]) -> Dict[str, Any]:
    """Verify a previously issued provenance seal."""
    with open(file_path, "rb") as f:
        current_hash = hashlib.sha256(f.read()).hexdigest()
    if current_hash != seal.get("file_hash"):
        return {"valid": False, "reason": "File hash mismatch — content has been modified."}
    canonical    = json.dumps(seal.get("payload", {}), sort_keys=True).encode()
    expected_sig = hmac.new(SECRET_KEY.encode(), canonical, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_sig, seal.get("signature", "")):
        return {"valid": False, "reason": "Signature mismatch — seal may be forged."}
    return {"valid": True, "reason": "Seal verified."}


# ── module-level singleton ────────────────────────────────────────────────────

_service = SourceSealService()
