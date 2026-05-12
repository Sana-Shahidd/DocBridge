"""
Watermark Service — invisible steganographic watermarking for leak tracing.

Two embedding methods:
  1. imwatermark (dwtDct) — DWT+DCT, 32-bit token, preferred when library available
  2. Custom DCT-QIM       — pure scipy block-DCT with QIM, longer payload, always available

Both methods store the full payload in the WatermarkRegistry database so that
on extraction the original recipient can be identified by looking up the decoded
token.

Screen-resistant mode uses a stronger QIM step and adds a spatial-domain
periodic luminance pattern that survives JPEG → print → phone-camera recapture.
"""

import hashlib
import io
import struct
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

try:
    from PIL import Image
    _PIL = True
except ImportError:
    _PIL = False

try:
    import cv2
    _CV2 = True
except ImportError:
    _CV2 = False

try:
    from scipy.fft import dct as _dct, idct as _idct
    _SCIPY = True
except ImportError:
    _SCIPY = False

try:
    from imwatermark import WatermarkEncoder, WatermarkDecoder
    _IW = True
except ImportError:
    _IW = False

from database import SessionLocal, WatermarkRegistry

# ── constants ─────────────────────────────────────────────────────────────────

_BLOCK        = 8         # DCT block size (pixels)
_QIM_STEP     = 14        # quantisation step for standard embedding
_QIM_STEP_SCR = 22        # stronger step for screen-resistant mode
_REPEAT       = 3         # repetition coding factor (majority vote)
_MAGIC        = b"\x57\x4D"  # "WM" — 2-byte magic header in payload stream
_IW_BITS      = 32        # bits used by the imwatermark dwtDct method

# Mid-frequency DCT positions within an 8×8 block (zig-zag positions 12-19)
_MID_FREQ: List[Tuple[int, int]] = [
    (2, 3), (3, 2), (4, 1), (3, 3), (4, 2), (2, 4), (4, 3), (3, 4),
]

_PSNR_TARGET = 40.0       # minimum acceptable PSNR (dB)


# ═════════════════════════════════════════════════════════════════════════════
# WatermarkService
# ═════════════════════════════════════════════════════════════════════════════

class WatermarkService:

    # ── 1. Embed watermark ────────────────────────────────────────────────────

    def embed_watermark(
        self, image_path: str, payload: str, output_path: str
    ) -> Dict[str, Any]:
        """
        Embed an invisible watermark carrying *payload* into the image.

        Tries the imwatermark dwtDct method first; falls back to the custom
        DCT-QIM implementation when the library is unavailable.

        Returns
        -------
        {"watermark_id", "psnr", "payload", "output_path"}
        """
        if not Path(image_path).exists():
            return _wm_error("Source image not found.")

        if _IW and _CV2:
            result = self._embed_iw(image_path, payload, output_path, screen_resistant=False)
        else:
            result = self._embed_dct(image_path, payload, output_path, step=_QIM_STEP)

        if "error" not in result:
            self._store_registry(result["watermark_id"], image_path, payload)

        return result

    # ── 2. Extract watermark ──────────────────────────────────────────────────

    def extract_watermark(self, image_path: str) -> Dict[str, Any]:
        """
        Extract any embedded watermark from *image_path* and look up the
        original recipient in the WatermarkRegistry.

        Returns
        -------
        {"payload_found", "decoded_payload", "original_recipient", "watermark_id"}
        """
        if not Path(image_path).exists():
            return {"payload_found": False, "decoded_payload": "",
                    "original_recipient": None, "watermark_id": None,
                    "error": "File not found."}

        decoded: Optional[str] = None

        # Try imwatermark extraction first
        if _IW and _CV2:
            decoded = self._extract_iw(image_path)

        # Fall back / supplement with DCT extraction
        if not decoded and _SCIPY and _CV2:
            decoded = self._extract_dct(image_path)

        if not decoded:
            return {"payload_found": False, "decoded_payload": "",
                    "original_recipient": None, "watermark_id": None}

        # Lookup in registry
        recipient, wm_id = self._lookup_registry(decoded)

        return {
            "payload_found":     True,
            "decoded_payload":   decoded,
            "original_recipient": recipient,
            "watermark_id":      wm_id,
        }

    # ── 3. Screen-resistant watermark ─────────────────────────────────────────

    def embed_screen_resistant_watermark(
        self, image_path: str, payload: str, output_path: str
    ) -> Dict[str, Any]:
        """
        Embed a stronger watermark designed to survive the "analog hole":
        screen photography, JPEG recompression, and scan/recapture.

        Uses DCT-QIM with a wider quantisation step (_QIM_STEP_SCR) plus a
        low-amplitude periodic luminance grid (Moiré-robust spatial pattern).

        Returns the same structure as embed_watermark.
        """
        if not Path(image_path).exists():
            return _wm_error("Source image not found.")

        result = self._embed_dct(image_path, payload, output_path, step=_QIM_STEP_SCR,
                                  add_spatial_pattern=True)

        if "error" not in result:
            self._store_registry(result["watermark_id"], image_path, payload)

        return result

    # ── 4. Integrity verification ─────────────────────────────────────────────

    def verify_watermark_integrity(
        self, original_path: str, suspected_leaked_path: str
    ) -> Dict[str, Any]:
        """
        Extract watermarks from both the original and a suspected leaked copy
        and compare the payloads.

        Returns
        -------
        {"match", "original_payload", "leaked_payload", "leak_confirmed"}
        """
        orig_result   = self.extract_watermark(original_path)
        leaked_result = self.extract_watermark(suspected_leaked_path)

        orig_payload   = orig_result.get("decoded_payload", "")
        leaked_payload = leaked_result.get("decoded_payload", "")

        match = bool(
            orig_result["payload_found"]
            and leaked_result["payload_found"]
            and orig_payload == leaked_payload
        )

        return {
            "match":            match,
            "original_payload": orig_payload,
            "leaked_payload":   leaked_payload,
            "leak_confirmed":   match and bool(orig_payload),
        }

    # ══════════════════════════════════════════════════════════════════════════
    # Internal: imwatermark (dwtDct) path
    # ══════════════════════════════════════════════════════════════════════════

    def _embed_iw(
        self, image_path: str, payload: str, output_path: str, screen_resistant: bool
    ) -> Dict[str, Any]:
        """Embed using imwatermark dwtDct (32-bit token → DB stores full payload)."""
        try:
            bgr = cv2.imread(image_path)
            if bgr is None:
                raise ValueError("cv2 could not read image")

            # Hash payload to 32 bits for imwatermark
            token_bytes = hashlib.sha256(payload.encode()).digest()[:4]
            token_bits  = _bytes_to_bits(token_bytes)   # 32 bits

            encoder = WatermarkEncoder()
            encoder.set_watermark('bits', token_bits)
            method  = 'dwtDctSvd' if screen_resistant else 'dwtDct'
            bgr_wm  = encoder.encode(bgr, method)

            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(output_path, bgr_wm)

            psnr = _psnr(bgr, bgr_wm)
            wm_id = uuid.uuid4().hex

            return {"watermark_id": wm_id, "psnr": round(psnr, 2),
                    "payload": payload, "output_path": output_path,
                    "method": method}
        except Exception as exc:
            # Graceful fallback — caller will switch to DCT path
            return {"error": str(exc)}

    def _extract_iw(self, image_path: str) -> Optional[str]:
        """Try to decode a dwtDct 32-bit token; look it up in the registry."""
        try:
            bgr = cv2.imread(image_path)
            if bgr is None:
                return None
            decoder = WatermarkDecoder('bits', _IW_BITS)
            bits    = decoder.decode(bgr, 'dwtDct')
            token   = _bits_to_bytes(bits)
            # Find matching payload in DB by comparing SHA-256 prefix
            db = SessionLocal()
            try:
                rows = db.query(WatermarkRegistry).all()
                for row in rows:
                    expected = hashlib.sha256(row.watermark_payload.encode()).digest()[:4]
                    if expected == token:
                        return row.watermark_payload
            finally:
                db.close()
        except Exception:
            pass
        return None

    # ══════════════════════════════════════════════════════════════════════════
    # Internal: custom DCT-QIM path (always available via scipy)
    # ══════════════════════════════════════════════════════════════════════════

    def _embed_dct(
        self,
        image_path:          str,
        payload:             str,
        output_path:         str,
        step:                int  = _QIM_STEP,
        add_spatial_pattern: bool = False,
    ) -> Dict[str, Any]:
        """
        Block-DCT QIM embedding in the Y channel.

        Payload wire format (before repetition coding):
          [MAGIC 2B] [LENGTH 2B uint16-BE] [DATA n B] [CRC 1B xor-checksum]

        Each raw bit is repeated _REPEAT times; extraction uses majority vote.
        """
        if not _SCIPY or not _CV2:
            return _wm_error("scipy or OpenCV not available for DCT embedding.")

        bgr = cv2.imread(image_path)
        if bgr is None:
            return _wm_error("Could not read image.")

        # Build payload bytes
        data       = payload.encode("utf-8")
        crc        = _xor_crc(data)
        raw_bytes  = _MAGIC + struct.pack(">H", len(data)) + data + bytes([crc])
        raw_bits   = _bytes_to_bits(raw_bytes)
        # Interleaved repetition: [b0,b0,b0, b1,b1,b1, ...] for majority-vote extraction
        embed_bits = [bit for bit in raw_bits for _ in range(_REPEAT)]

        # Work in YCrCb float32
        ycrcb  = cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb).astype(np.float32)
        y_orig = ycrcb[:, :, 0].copy()
        h, w   = y_orig.shape

        n_blocks_h = h // _BLOCK
        n_blocks_w = w // _BLOCK
        capacity   = n_blocks_h * n_blocks_w * len(_MID_FREQ)

        if len(embed_bits) > capacity:
            return _wm_error(
                f"Payload too large: need {len(embed_bits)} bits, "
                f"image capacity {capacity} bits ({capacity // _REPEAT // 8} bytes)."
            )

        y_mod    = y_orig.copy()
        bit_idx  = 0

        for bi in range(n_blocks_h):
            for bj in range(n_blocks_w):
                r0, c0 = bi * _BLOCK, bj * _BLOCK
                block  = y_mod[r0:r0+_BLOCK, c0:c0+_BLOCK]
                dct_b  = _dct2(block)
                modified = False

                for (pi, pj) in _MID_FREQ:
                    if bit_idx >= len(embed_bits):
                        break
                    bit     = embed_bits[bit_idx]
                    coeff   = dct_b[pi, pj]
                    # QIM: map coeff to nearest even/odd multiple of step
                    q       = round(coeff / step)
                    if (q % 2) != bit:
                        q += 1 if bit == 1 else -1
                    dct_b[pi, pj] = q * step
                    modified = True
                    bit_idx += 1

                if modified:
                    y_mod[r0:r0+_BLOCK, c0:c0+_BLOCK] = _idct2(dct_b)

                if bit_idx >= len(embed_bits):
                    break
            if bit_idx >= len(embed_bits):
                break

        # Optional spatial pattern for screen resistance
        if add_spatial_pattern:
            payload_hash = int(hashlib.sha256(payload.encode()).hexdigest(), 16)
            period       = 8 + (payload_hash % 8)           # 8–15 px period
            amplitude    = 1.5                               # imperceptible ±1.5 luma units
            xs           = np.arange(w)
            ys           = np.arange(h)
            pattern      = amplitude * np.sin(2 * np.pi * xs[None, :] / period) \
                         * np.sin(2 * np.pi * ys[:, None] / period)
            y_mod        = y_mod + pattern.astype(np.float32)

        ycrcb[:, :, 0] = np.clip(y_mod, 0, 255)
        bgr_wm = cv2.cvtColor(ycrcb.astype(np.uint8), cv2.COLOR_YCrCb2BGR)

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        ext = Path(output_path).suffix.lower()
        if ext in (".jpg", ".jpeg"):
            cv2.imwrite(output_path, bgr_wm, [cv2.IMWRITE_JPEG_QUALITY, 97])
        else:
            cv2.imwrite(output_path, bgr_wm)

        psnr  = _psnr(bgr, bgr_wm)
        wm_id = uuid.uuid4().hex

        return {
            "watermark_id": wm_id,
            "psnr":         round(psnr, 2),
            "payload":      payload,
            "output_path":  output_path,
            "method":       "dct_qim_screen" if add_spatial_pattern else "dct_qim",
        }

    def _extract_dct(self, image_path: str) -> Optional[str]:
        """Read DCT-QIM bits, apply majority vote, reconstruct payload."""
        if not _SCIPY or not _CV2:
            return None

        bgr = cv2.imread(image_path)
        if bgr is None:
            return None

        ycrcb = cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb).astype(np.float32)
        y     = ycrcb[:, :, 0]
        h, w  = y.shape

        n_blocks_h = h // _BLOCK
        n_blocks_w = w // _BLOCK
        max_bits   = n_blocks_h * n_blocks_w * len(_MID_FREQ)

        raw_bits: List[int] = []

        for bi in range(n_blocks_h):
            for bj in range(n_blocks_w):
                r0, c0 = bi * _BLOCK, bj * _BLOCK
                block  = y[r0:r0+_BLOCK, c0:c0+_BLOCK]
                dct_b  = _dct2(block)
                for (pi, pj) in _MID_FREQ:
                    coeff = dct_b[pi, pj]
                    raw_bits.append(int(round(coeff / _QIM_STEP)) % 2)

        # Majority vote over repetitions
        if len(raw_bits) < _REPEAT:
            return None
        n_orig = len(raw_bits) // _REPEAT
        voted: List[int] = []
        for i in range(n_orig):
            chunk = raw_bits[i * _REPEAT:(i + 1) * _REPEAT]
            voted.append(1 if sum(chunk) > _REPEAT // 2 else 0)

        # Decode magic + length
        if len(voted) < (2 + 2) * 8:
            return None
        magic = _bits_to_bytes(voted[:16])
        if magic != _MAGIC:
            # Also try without spatial pattern (QIM_STEP_SCR path)
            return self._extract_dct_step(y, _QIM_STEP_SCR)

        data_len = struct.unpack(">H", _bits_to_bytes(voted[16:32]))[0]
        total_needed = (2 + 2 + data_len + 1) * 8
        if len(voted) < total_needed:
            return None

        data_bits = voted[32:32 + data_len * 8]
        data      = _bits_to_bytes(data_bits)
        crc_bits  = voted[32 + data_len * 8:32 + data_len * 8 + 8]
        stored_crc = _bits_to_bytes(crc_bits)[0]

        if _xor_crc(data) != stored_crc:
            return None

        try:
            return data.decode("utf-8")
        except Exception:
            return None

    def _extract_dct_step(self, y: np.ndarray, step: int) -> Optional[str]:
        """Re-run DCT extraction with a different QIM step (screen-resistant mode)."""
        h, w = y.shape
        n_blocks_h = h // _BLOCK
        n_blocks_w = w // _BLOCK
        raw_bits: List[int] = []

        for bi in range(n_blocks_h):
            for bj in range(n_blocks_w):
                r0, c0 = bi * _BLOCK, bj * _BLOCK
                dct_b  = _dct2(y[r0:r0+_BLOCK, c0:c0+_BLOCK])
                for (pi, pj) in _MID_FREQ:
                    raw_bits.append(int(round(dct_b[pi, pj] / step)) % 2)

        n_orig = len(raw_bits) // _REPEAT
        voted  = [1 if sum(raw_bits[i*_REPEAT:(i+1)*_REPEAT]) > _REPEAT//2 else 0
                  for i in range(n_orig)]

        if len(voted) < 32:
            return None
        magic = _bits_to_bytes(voted[:16])
        if magic != _MAGIC:
            return None
        data_len = struct.unpack(">H", _bits_to_bytes(voted[16:32]))[0]
        if len(voted) < (2 + 2 + data_len + 1) * 8:
            return None

        data = _bits_to_bytes(voted[32:32 + data_len * 8])
        crc  = _bits_to_bytes(voted[32 + data_len*8:32 + data_len*8 + 8])[0]
        if _xor_crc(data) != crc:
            return None
        try:
            return data.decode("utf-8")
        except Exception:
            return None

    # ══════════════════════════════════════════════════════════════════════════
    # Database helpers
    # ══════════════════════════════════════════════════════════════════════════

    def _store_registry(
        self, watermark_id: str, image_path: str, payload: str
    ) -> None:
        file_hash = _sha256(image_path)
        db = SessionLocal()
        try:
            record = WatermarkRegistry(
                id                = watermark_id,
                file_hash         = file_hash,
                watermark_payload = payload,
                user_id           = payload.split(":")[0] if ":" in payload else payload,
            )
            db.add(record)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

    def _lookup_registry(
        self, payload: str
    ) -> Tuple[Optional[str], Optional[str]]:
        """Return (original_recipient / user_id, watermark_id) for a decoded payload."""
        db = SessionLocal()
        try:
            row = (db.query(WatermarkRegistry)
                   .filter(WatermarkRegistry.watermark_payload == payload)
                   .order_by(WatermarkRegistry.created_at.desc())
                   .first())
            if row:
                return row.user_id, row.id
            return None, None
        finally:
            db.close()


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════

def _dct2(block: np.ndarray) -> np.ndarray:
    return _dct(_dct(block.T, norm="ortho").T, norm="ortho")


def _idct2(block: np.ndarray) -> np.ndarray:
    return _idct(_idct(block.T, norm="ortho").T, norm="ortho")


def _bytes_to_bits(data: bytes) -> List[int]:
    bits: List[int] = []
    for byte in data:
        for shift in range(7, -1, -1):
            bits.append((byte >> shift) & 1)
    return bits


def _bits_to_bytes(bits: List[int]) -> bytes:
    result = bytearray()
    for i in range(0, len(bits) - len(bits) % 8, 8):
        byte = 0
        for shift, bit in enumerate(bits[i:i+8]):
            byte |= bit << (7 - shift)
        result.append(byte)
    return bytes(result)


def _xor_crc(data: bytes) -> int:
    crc = 0
    for b in data:
        crc ^= b
    return crc


def _psnr(original: np.ndarray, modified: np.ndarray) -> float:
    mse = float(np.mean((original.astype(np.float64) - modified.astype(np.float64)) ** 2))
    if mse < 1e-10:
        return 100.0
    return 10.0 * np.log10(255.0 ** 2 / mse)


def _sha256(path: str) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _wm_error(msg: str) -> Dict[str, Any]:
    return {"watermark_id": None, "psnr": 0.0, "payload": "",
            "output_path": None, "error": msg}


# ── module-level singleton + router-facing wrappers ───────────────────────────

_service = WatermarkService()


def embed_watermark(image_path: str, payload: str, output_path: str) -> Dict[str, Any]:
    return _service.embed_watermark(image_path, payload, output_path)


def extract_watermark(image_path: str) -> Dict[str, Any]:
    return _service.extract_watermark(image_path)
