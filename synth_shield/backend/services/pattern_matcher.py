"""
Pattern Matcher — detects coordinated synthetic media campaigns
across multiple cybercrime reports in the database.

Public API
----------
detect_patterns(db_session)          -> List[Pattern]
generate_fia_brief(pattern: Pattern) -> bytes

Legacy stubs (kept for backward compatibility)
----------------------------------------------
load_patterns(patterns_dir)          -> None
match_patterns(file_path, media_type) -> Dict
"""

import io
import math
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# ── Optional heavy dependencies ──────────────────────────────────────────────
try:
    import numpy as np
    _NP = True
except ImportError:
    _NP = False

try:
    from reportlab.lib import colors
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        HRFlowable, KeepTogether, Paragraph,
        SimpleDocTemplate, Spacer, Table, TableStyle,
    )
    _RL = True
except ImportError:
    _RL = False

# ── Thresholds ────────────────────────────────────────────────────────────────
_PRNU_THRESHOLD      = 0.85
_CNN_VEC_THRESHOLD   = 0.90
_AUDIO_THRESHOLD     = 0.88
_TEMPORAL_HOURS      = 48
_TEMPORAL_DELTA      = timedelta(hours=_TEMPORAL_HOURS)

# Canonical signal order for feature vectors
_SIGNAL_ORDER = [
    "CNN Deepfake Classifier",
    "Quantum Noise Analysis",
    "Error Level Analysis",
    "Metadata Integrity",
    "News Context Match",
    "Geographic Consistency",
    "Voice Clone Detection",
]

UPLOAD_DIR = Path("uploads")


# ═════════════════════════════════════════════════════════════════════════════
# Data model
# ═════════════════════════════════════════════════════════════════════════════

@dataclass
class Pattern:
    pattern_id:        str
    type:              str
    members:           List[Dict[str, Any]]
    first_seen:        Optional[str]
    last_seen:         Optional[str]
    confidence:        float
    summary:           str
    geographic_spread: List[str]
    dimensions_matched: List[str] = field(default_factory=list)


# ═════════════════════════════════════════════════════════════════════════════
# Union-Find (path-compressed, rank-unioned)
# ═════════════════════════════════════════════════════════════════════════════

class _UnionFind:
    def __init__(self, n: int):
        self._p    = list(range(n))
        self._rank = [0] * n

    def find(self, x: int) -> int:
        while self._p[x] != x:
            self._p[x] = self._p[self._p[x]]   # path halving
            x = self._p[x]
        return x

    def union(self, x: int, y: int) -> None:
        px, py = self.find(x), self.find(y)
        if px == py:
            return
        if self._rank[px] < self._rank[py]:
            px, py = py, px
        self._p[py] = px
        if self._rank[px] == self._rank[py]:
            self._rank[px] += 1

    def groups(self) -> Dict[int, List[int]]:
        out: Dict[int, List[int]] = {}
        for i in range(len(self._p)):
            root = self.find(i)
            out.setdefault(root, []).append(i)
        return out


# ═════════════════════════════════════════════════════════════════════════════
# Feature extraction helpers
# ═════════════════════════════════════════════════════════════════════════════

def _signal_vector(signal_breakdown: Optional[List[Dict]]) -> List[float]:
    """Extract a fixed-length fake_score vector from a signal_breakdown list."""
    lookup = {s["signal"]: s.get("fake_score", 0.5) for s in (signal_breakdown or [])}
    return [lookup.get(name, 0.5) for name in _SIGNAL_ORDER]


def _cosine_sim(v1: List[float], v2: List[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    n1  = math.sqrt(sum(a * a for a in v1))
    n2  = math.sqrt(sum(b * b for b in v2))
    if n1 < 1e-10 or n2 < 1e-10:
        return 0.0
    return dot / (n1 * n2)


def _audio_clone_score(signal_breakdown: Optional[List[Dict]]) -> Optional[float]:
    """Return voice_clone fake_score from breakdown, or None if absent."""
    for s in (signal_breakdown or []):
        if s.get("signal") == "Voice Clone Detection":
            return s.get("fake_score")
    return None


def _geo_region(geo_result: Optional[Dict]) -> Optional[str]:
    if not geo_result:
        return None
    region = geo_result.get("likely_region", "Unknown")
    return None if region in ("Unknown", "", None) else region


def _find_upload_file(analysis_id: str) -> Optional[Path]:
    """Locate the original uploaded file for an analysis (image/audio/video)."""
    if not UPLOAD_DIR.exists():
        return None
    for p in UPLOAD_DIR.glob(f"{analysis_id}*"):
        if p.suffix.lower() != ".pdf":
            return p
    return None


def _extract_prnu(path: Path) -> Optional[Any]:
    """Extract PRNU fingerprint — returns numpy array or None."""
    if not _NP:
        return None
    try:
        from services.qsam_engine import extract_prnu_fingerprint
        return extract_prnu_fingerprint(str(path))
    except Exception:
        return None


def _compare_prnu(fp1: Any, fp2: Any) -> float:
    """Compare two PRNU fingerprints → [0, 1]. Returns 0.5 on failure."""
    if fp1 is None or fp2 is None or not _NP:
        return 0.5
    try:
        from services.qsam_engine import compare_fingerprints
        return compare_fingerprints(fp1, fp2)
    except Exception:
        return 0.5


# ═════════════════════════════════════════════════════════════════════════════
# Main detection logic
# ═════════════════════════════════════════════════════════════════════════════

def detect_patterns(db_session) -> List[Pattern]:
    """
    Query all CybercrimeReports and their associated AnalysisResults,
    cluster by similarity across five dimensions, and return Pattern objects
    for every group of 2+ related reports.
    """
    # Lazy import to avoid circular dependency at module load time
    from database import AnalysisResult, CybercrimeReport

    rows = (
        db_session.query(CybercrimeReport, AnalysisResult)
        .outerjoin(AnalysisResult, CybercrimeReport.analysis_id == AnalysisResult.id)
        .all()
    )

    if len(rows) < 2:
        return []

    n = len(rows)
    uf = _UnionFind(n)

    # dimension_hits[i][j] tracks which dimensions linked i and j (i < j)
    dim_hits: Dict[Tuple[int, int], Set[str]] = {}

    # Pre-extract features (expensive ops cached per index)
    signal_vecs  = [_signal_vector(ar.signal_breakdown if ar else None)  for _, ar in rows]
    audio_scores = [_audio_clone_score(ar.signal_breakdown if ar else None) for _, ar in rows]
    geo_regions  = [_geo_region(ar.geolocation_result if ar else None)   for _, ar in rows]
    timestamps   = [ar.created_at if ar else None                        for _, ar in rows]

    # PRNU fingerprints — only extracted if image files exist on disk
    prnu_fps: List[Optional[Any]] = [None] * n
    for i, (rpt, ar) in enumerate(rows):
        if ar and ar.file_type == "image":
            p = _find_upload_file(ar.id)
            if p:
                prnu_fps[i] = _extract_prnu(p)

    # Pairwise comparison (O(n²) — acceptable for typical report volumes)
    for i in range(n):
        for j in range(i + 1, n):
            key = (i, j)
            matched_dims: Set[str] = set()
            _, ar_i = rows[i]
            _, ar_j = rows[j]

            # ── a. PRNU fingerprint similarity ────────────────────────────
            if prnu_fps[i] is not None and prnu_fps[j] is not None:
                prnu_sim = _compare_prnu(prnu_fps[i], prnu_fps[j])
                if prnu_sim >= _PRNU_THRESHOLD:
                    matched_dims.add("device_fingerprint")

            # ── b. CNN feature vector cosine similarity ───────────────────
            cnn_sim = _cosine_sim(signal_vecs[i], signal_vecs[j])
            if cnn_sim >= _CNN_VEC_THRESHOLD:
                matched_dims.add("face_clone")

            # ── c. Audio clone fingerprint similarity ─────────────────────
            as_i, as_j = audio_scores[i], audio_scores[j]
            if as_i is not None and as_j is not None:
                if abs(as_i - as_j) <= (1.0 - _AUDIO_THRESHOLD):
                    # Both high (both synthesized) and close in score
                    if as_i >= _AUDIO_THRESHOLD and as_j >= _AUDIO_THRESHOLD:
                        matched_dims.add("voice_clone")

            # ── d. Temporal clustering ────────────────────────────────────
            ts_i, ts_j = timestamps[i], timestamps[j]
            if ts_i is not None and ts_j is not None:
                if abs((ts_i - ts_j).total_seconds()) <= _TEMPORAL_DELTA.total_seconds():
                    matched_dims.add("temporal")

            # ── e. Geographic clustering ──────────────────────────────────
            r_i, r_j = geo_regions[i], geo_regions[j]
            if r_i is not None and r_j is not None and r_i == r_j:
                matched_dims.add("geographic")

            if matched_dims:
                uf.union(i, j)
                dim_hits[key] = matched_dims

    # ── Collect groups with 2+ members ────────────────────────────────────────
    patterns: List[Pattern] = []
    for root, members_idx in uf.groups().items():
        if len(members_idx) < 2:
            continue

        # Aggregate dimension hits for this group
        group_dims: Set[str] = set()
        for i in members_idx:
            for j in members_idx:
                if i < j:
                    group_dims |= dim_hits.get((i, j), set())

        # Build member list
        member_list: List[Dict] = []
        for idx in members_idx:
            rpt, ar = rows[idx]
            member_list.append({
                "report_id":    rpt.id,
                "analysis_id":  rpt.analysis_id,
                "file_hash":    ar.file_hash   if ar else None,
                "file_type":    ar.file_type   if ar else None,
                "reality_score": ar.reality_score if ar else None,
                "platform":     rpt.platform,
                "created_at":   (rpt.created_at.isoformat()
                                 if rpt.created_at else None),
                "geo_region":   geo_regions[idx],
                "audio_clone_score": audio_scores[idx],
                "signal_vector": signal_vecs[idx],
            })

        # Sort by timestamp
        member_list.sort(key=lambda m: m["created_at"] or "")
        timestamps_str = [m["created_at"] for m in member_list if m["created_at"]]
        first_seen = timestamps_str[0]  if timestamps_str else None
        last_seen  = timestamps_str[-1] if timestamps_str else None

        # Geographic spread
        geo_spread = sorted({m["geo_region"] for m in member_list if m["geo_region"]})

        # Pattern type label
        ptype = _pattern_type_label(group_dims)

        # Confidence: dims matched × coverage
        confidence = round(
            min(len(group_dims) / 3.0, 1.0) * 0.6
            + min(len(members_idx) / 5.0, 1.0) * 0.4,
            3,
        )

        summary = _build_summary(ptype, members_idx, group_dims, first_seen, last_seen)

        patterns.append(Pattern(
            pattern_id         = f"PAT-{uuid.uuid4().hex[:8].upper()}",
            type               = ptype,
            members            = member_list,
            first_seen         = first_seen,
            last_seen          = last_seen,
            confidence         = confidence,
            summary            = summary,
            geographic_spread  = geo_spread,
            dimensions_matched = sorted(group_dims),
        ))

    # Sort by confidence descending
    patterns.sort(key=lambda p: p.confidence, reverse=True)
    return patterns


def _pattern_type_label(dims: Set[str]) -> str:
    if len(dims) >= 3:
        return "multi_dimensional_campaign"
    if "device_fingerprint" in dims:
        return "device_fingerprint_campaign"
    if "voice_clone" in dims:
        return "voice_clone_campaign"
    if "face_clone" in dims:
        return "face_clone_campaign"
    if "geographic" in dims:
        return "geographic_cluster"
    return "temporal_campaign"


def _build_summary(ptype: str, members_idx: List[int],
                   dims: Set[str], first_seen: Optional[str],
                   last_seen: Optional[str]) -> str:
    n   = len(members_idx)
    dim_labels = {
        "device_fingerprint": "shared camera device (PRNU match)",
        "face_clone":         "similar GAN face generation (CNN vector match)",
        "voice_clone":        "matching voice clone signatures",
        "temporal":           f"reports clustered within {_TEMPORAL_HOURS}h window",
        "geographic":         "matching geographic region",
    }
    dim_str = "; ".join(dim_labels[d] for d in sorted(dims) if d in dim_labels)
    date_str = ""
    if first_seen and last_seen and first_seen != last_seen:
        date_str = f" from {first_seen[:10]} to {last_seen[:10]}"
    elif first_seen:
        date_str = f" on {first_seen[:10]}"
    return (
        f"Cluster of {n} related report(s){date_str} linked by: {dim_str}."
    )


# ═════════════════════════════════════════════════════════════════════════════
# FIA Brief PDF
# ═════════════════════════════════════════════════════════════════════════════

def generate_fia_brief(pattern: Pattern) -> bytes:
    """
    Generate a FEDERAL INVESTIGATION AGENCY Cybercrime Wing Intelligence Brief
    for a detected campaign pattern.

    Returns PDF bytes (or JSON bytes if ReportLab is unavailable).
    """
    case_ref   = f"FIA-CW-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    generated  = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    if not _RL:
        import json
        return json.dumps({
            "case_ref": case_ref, "pattern_id": pattern.pattern_id,
            "type": pattern.type, "members": len(pattern.members),
            "generated": generated,
            "note": "PDF unavailable — reportlab not installed.",
        }, indent=2).encode()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            topMargin=1.8*cm, bottomMargin=1.8*cm,
                            leftMargin=2.2*cm, rightMargin=2.2*cm)
    styles = getSampleStyleSheet()

    # Colour palette
    _NAVY   = HexColor("#1e3a5f")
    _RED_BG = HexColor("#7f1d1d")
    _GRAY   = HexColor("#6b7280")
    _LIGHT  = HexColor("#f3f4f6")
    _DARK   = HexColor("#111827")
    _AMBER  = HexColor("#d97706")

    # Custom paragraph styles
    def _ps(name, **kw):
        parent = kw.pop("parent", styles["Normal"])
        return ParagraphStyle(name, parent=parent, **kw)

    title_s    = _ps("FIATitle",    parent=styles["Title"],   fontSize=14, textColor=colors.white, alignment=1)
    classify_s = _ps("FIAClass",    fontSize=10, textColor=colors.white,  alignment=1, fontName="Helvetica-Bold")
    h2_s       = _ps("FIAH2",       parent=styles["Heading2"], fontSize=11, textColor=_NAVY, spaceBefore=10, spaceAfter=4)
    body_s     = _ps("FIABody",     fontSize=9,  leading=14, textColor=_DARK)
    small_s    = _ps("FIASmall",    fontSize=8,  leading=12, textColor=_GRAY)
    kv_key_s   = _ps("FIAKey",      fontSize=9,  fontName="Helvetica-Bold", textColor=_DARK)
    mono_s     = _ps("FIAMono",     fontSize=7,  leading=11, textColor=_GRAY, fontName="Courier")
    warn_s     = _ps("FIAWarn",     fontSize=9,  leading=13, textColor=_AMBER)

    story: list = []

    # ── Classification banner ─────────────────────────────────────────────────
    banner_data = [[Paragraph("⬛  RESTRICTED — FOR OFFICIAL USE ONLY  ⬛", classify_s)]]
    banner = Table(banner_data, colWidths=["100%"])
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _RED_BG),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(banner)
    story.append(Spacer(1, 6))

    # ── Agency header ─────────────────────────────────────────────────────────
    hdr_data = [[Paragraph(
        "FEDERAL INVESTIGATION AGENCY<br/>"
        "<font size='10'>Cybercrime Wing — Intelligence Brief</font>",
        title_s,
    )]]
    hdr = Table(hdr_data, colWidths=["100%"])
    hdr.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _NAVY),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(hdr)
    story.append(Spacer(1, 8))

    # ── Case reference block ──────────────────────────────────────────────────
    meta_rows = [
        [Paragraph("Case Reference:", kv_key_s), Paragraph(case_ref, body_s)],
        [Paragraph("Pattern ID:",     kv_key_s), Paragraph(pattern.pattern_id, body_s)],
        [Paragraph("Generated:",      kv_key_s), Paragraph(generated, body_s)],
        [Paragraph("Classification:", kv_key_s), Paragraph("RESTRICTED", warn_s)],
    ]
    meta_tbl = Table(meta_rows, colWidths=[4.5*cm, None])
    meta_tbl.setStyle(TableStyle([
        ("FONTSIZE",   (0, 0), (-1, -1), 9),
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(meta_tbl)
    story.append(HRFlowable(width="100%", thickness=1.5, color=_NAVY, spaceAfter=6))

    # ── 1. Pattern Summary ────────────────────────────────────────────────────
    story.append(Paragraph("1.  Pattern Summary", h2_s))
    type_friendly = pattern.type.replace("_", " ").title()
    summary_rows = [
        [Paragraph("Campaign Type:",      kv_key_s), Paragraph(type_friendly,                body_s)],
        [Paragraph("Scale:",              kv_key_s), Paragraph(f"{len(pattern.members)} linked incident(s)", body_s)],
        [Paragraph("First Detected:",     kv_key_s), Paragraph(pattern.first_seen or "—",    body_s)],
        [Paragraph("Last Detected:",      kv_key_s), Paragraph(pattern.last_seen  or "—",    body_s)],
        [Paragraph("Confidence:",         kv_key_s), Paragraph(f"{pattern.confidence:.0%}",  body_s)],
        [Paragraph("Geographic Spread:",  kv_key_s), Paragraph(
            ", ".join(pattern.geographic_spread) if pattern.geographic_spread else "Undetermined",
            body_s,
        )],
        [Paragraph("Dimensions Matched:", kv_key_s), Paragraph(
            ", ".join(d.replace("_", " ") for d in pattern.dimensions_matched) or "—",
            body_s,
        )],
    ]
    story.append(Table(summary_rows, colWidths=[4.5*cm, None],
                       style=TableStyle([
                           ("FONTSIZE",  (0, 0), (-1, -1), 9),
                           ("VALIGN",    (0, 0), (-1, -1), "TOP"),
                           ("TOPPADDING",    (0, 0), (-1, -1), 2),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                       ])))
    story.append(Spacer(1, 4))
    story.append(Paragraph(pattern.summary, body_s))
    story.append(Spacer(1, 6))

    # ── 2. Incident Table ─────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=_GRAY, spaceAfter=4))
    story.append(Paragraph("2.  Incident Register", h2_s))
    inc_header = [
        Paragraph("<b>#</b>",          body_s),
        Paragraph("<b>Report ID</b>",  body_s),
        Paragraph("<b>Type</b>",       body_s),
        Paragraph("<b>Score</b>",      body_s),
        Paragraph("<b>Platform</b>",   body_s),
        Paragraph("<b>Date</b>",       body_s),
        Paragraph("<b>Region</b>",     body_s),
    ]
    inc_rows = [inc_header]
    for i, m in enumerate(pattern.members, 1):
        score = m.get("reality_score")
        inc_rows.append([
            Paragraph(str(i),                           small_s),
            Paragraph((m["report_id"] or "")[:12] + "…", small_s),
            Paragraph(m.get("file_type") or "—",        small_s),
            Paragraph(f"{int(score)}" if score is not None else "—", small_s),
            Paragraph(m.get("platform") or "—",         small_s),
            Paragraph((m.get("created_at") or "—")[:10], small_s),
            Paragraph(m.get("geo_region") or "—",       small_s),
        ])

    inc_tbl = Table(inc_rows, colWidths=[0.6*cm, 2.8*cm, 1.5*cm, 1.2*cm, 2.5*cm, 2.2*cm, None])
    inc_tbl.setStyle(TableStyle([
        ("BACKGROUND",     (0, 0), (-1, 0), _NAVY),
        ("TEXTCOLOR",      (0, 0), (-1, 0), colors.white),
        ("FONTNAME",       (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",       (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [_LIGHT, colors.white]),
        ("GRID",           (0, 0), (-1, -1), 0.3, _GRAY),
        ("VALIGN",         (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",     (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 3),
    ]))
    story.append(inc_tbl)
    story.append(Spacer(1, 6))

    # ── 3. Technical Evidence ─────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=_GRAY, spaceAfter=4))
    story.append(Paragraph("3.  Technical Evidence", h2_s))

    for i, m in enumerate(pattern.members, 1):
        sig_vec = m.get("signal_vector", [])
        vec_str = " | ".join(f"{v:.3f}" for v in sig_vec) if sig_vec else "unavailable"
        evidence_block = [
            Paragraph(f"<b>Incident {i} — {(m['report_id'] or '')[:16]}…</b>", body_s),
            Table([
                [Paragraph("SHA-256:", kv_key_s),
                 Paragraph(m.get("file_hash") or "—", mono_s)],
                [Paragraph("Analysis ID:", kv_key_s),
                 Paragraph(m.get("analysis_id") or "—", mono_s)],
                [Paragraph("Signal Vector:", kv_key_s),
                 Paragraph(vec_str, mono_s)],
                [Paragraph("Audio Clone:", kv_key_s),
                 Paragraph(
                     f"{m['audio_clone_score']:.3f}" if m.get("audio_clone_score") is not None else "N/A",
                     mono_s,
                 )],
                [Paragraph("GeoLens Region:", kv_key_s),
                 Paragraph(m.get("geo_region") or "Undetermined", mono_s)],
            ], colWidths=[3.5*cm, None],
               style=TableStyle([
                   ("FONTSIZE",  (0, 0), (-1, -1), 8),
                   ("VALIGN",    (0, 0), (-1, -1), "TOP"),
                   ("TOPPADDING",    (0, 0), (-1, -1), 1),
                   ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
               ])),
            Spacer(1, 4),
        ]
        story.append(KeepTogether(evidence_block))

    # ── 4. Recommended Actions ────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=_GRAY, spaceAfter=4))
    story.append(Paragraph("4.  Recommended Actions", h2_s))

    action_map = {
        "device_fingerprint_campaign": [
            "Initiate device seizure order for the identified camera (PRNU-linked).",
            "Cross-reference device serial numbers with importer/retailer records.",
            "Request forensic imaging of all associated storage media.",
        ],
        "voice_clone_campaign": [
            "Preserve original audio recordings for court-admissible analysis.",
            "Engage voice biometrics expert to produce a formal comparison report.",
            "Identify and subpoena the voice synthesis platform service logs.",
        ],
        "face_clone_campaign": [
            "Submit GAN-generated face fingerprints to national deepfake database.",
            "Coordinate with platform trust-and-safety teams for takedown requests.",
            "Trace distribution network via metadata and IP logs.",
        ],
        "geographic_cluster": [
            "Deploy field investigators to the identified geographic region.",
            "Correlate with open-source intelligence (OSINT) for the area.",
            "Engage local law enforcement for coordination.",
        ],
        "temporal_campaign": [
            "Preserve server logs covering the identified 48-hour window.",
            "Request social media platform logs for accounts active in this period.",
            "Issue preservation orders to relevant cloud providers.",
        ],
        "multi_dimensional_campaign": [
            "Escalate to national cybercrime unit immediately.",
            "Coordinate cross-agency joint investigation team.",
            "Apply for emergency judicial order for platform data preservation.",
            "Issue media advisory to prevent further viral spread.",
        ],
    }
    actions = action_map.get(pattern.type, [
        "Conduct full forensic review of all linked incidents.",
        "Preserve all evidence under chain-of-custody protocol.",
    ])
    for action in actions:
        story.append(Paragraph(f"  •  {action}", body_s))
    story.append(Spacer(1, 8))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=2, color=_NAVY, spaceAfter=4))
    story.append(Paragraph(
        f"This brief is generated by SynthShield Intelligence Platform. "
        f"Case Ref: {case_ref} | {generated}",
        small_s,
    ))
    story.append(Spacer(1, 4))
    banner2_data = [[Paragraph("RESTRICTED — FOR OFFICIAL USE ONLY", classify_s)]]
    banner2 = Table(banner2_data, colWidths=["100%"])
    banner2.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _RED_BG),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(banner2)

    doc.build(story)
    return buf.getvalue()


# ═════════════════════════════════════════════════════════════════════════════
# Legacy stubs (kept for backward compatibility with existing router calls)
# ═════════════════════════════════════════════════════════════════════════════

_KNOWN_PATTERNS: List[Dict] = []


def load_patterns(patterns_dir: str = "models/patterns") -> None:
    """Load pattern templates from disk (stub — templates not yet defined)."""
    pass


def match_patterns(file_path: str, media_type: str) -> Dict[str, Any]:
    """
    Per-file pattern match against known synthetic watermark templates.
    Returns empty result until a template library is defined.
    """
    return {
        "matched":   [],
        "risk_score": 0.0,
        "details":   "No known-pattern templates loaded.",
    }
