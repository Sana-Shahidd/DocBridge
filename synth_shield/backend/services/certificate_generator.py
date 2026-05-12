"""
Certificate Generator — ReportLab PDF forensic analysis certificate.

Layout
------
  1. SynthShield header (logo text + tagline)
  2. Certificate ID + generation timestamp
  3. Analyzed file details (name, hash, type, size)
  4. Reality Score (large, color-coded)
  5. Signal breakdown table
  6. GeoLens geolocation section
  7. News context verification summary
  8. Legal disclaimer
  9. HMAC-SHA256 digital signature
 10. Footer

generate_certificate(analysis_result, file_info) → bytes
  Returns the PDF as bytes AND saves a copy to uploads/certificate_{uuid}.pdf.
"""

import hashlib
import hmac
import json
import math
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

SECRET_KEY  = os.getenv("SECRET_KEY", "change-me-before-production")
_UPLOAD_DIR = Path("uploads")

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm, mm
    from reportlab.lib.colors import HexColor, Color
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, KeepTogether,
    )
    from reportlab.graphics.shapes import Drawing, Rect, String
    from reportlab.graphics import renderPDF
    _RL = True
except ImportError:
    _RL = False

# ── Palette ───────────────────────────────────────────────────────────────────

_GREEN  = HexColor("#16a34a") if _RL else None
_AMBER  = HexColor("#d97706") if _RL else None
_RED    = HexColor("#dc2626") if _RL else None
_GRAY   = HexColor("#6b7280") if _RL else None
_DARK   = HexColor("#18181b") if _RL else None
_LIGHT  = HexColor("#f4f4f5") if _RL else None
_INDIGO = HexColor("#4f46e5") if _RL else None
_WHITE  = colors.white       if _RL else None


def _verdict_color(color_key: str):
    return {
        "green": _GREEN, "amber": _AMBER,
        "red":   _RED,   "gray":  _GRAY,
    }.get(color_key, _GRAY)


# ═════════════════════════════════════════════════════════════════════════════
# CertificateGenerator
# ═════════════════════════════════════════════════════════════════════════════

class CertificateGenerator:

    def generate_certificate(
        self,
        analysis_result: Dict[str, Any],
        file_info:        Dict[str, Any],
    ) -> bytes:
        """
        Generate a PDF forensic certificate.

        Parameters
        ----------
        analysis_result : output of ScoreEngine.calculate_reality_score()
        file_info       : {"filename", "file_hash", "file_type", "file_size_bytes"}

        Returns
        -------
        PDF as bytes.  Also saves to uploads/certificate_{cert_id}.pdf.
        """
        cert_id    = uuid.uuid4().hex
        generated  = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        if not _RL:
            return self._fallback_json(cert_id, generated, analysis_result, file_info)

        _UPLOAD_DIR.mkdir(exist_ok=True)
        out_path = str(_UPLOAD_DIR / f"certificate_{cert_id}.pdf")

        # ── Document setup ────────────────────────────────────────────────────
        doc = SimpleDocTemplate(
            out_path,
            pagesize   = A4,
            topMargin  = 1.5 * cm,
            bottomMargin = 1.5 * cm,
            leftMargin   = 2.0 * cm,
            rightMargin  = 2.0 * cm,
        )
        styles  = getSampleStyleSheet()
        story: List = []

        # Custom styles
        title_style = ParagraphStyle(
            "SSTitleStyle",
            parent    = styles["Title"],
            fontSize  = 22,
            textColor = _INDIGO,
            spaceAfter = 2,
        )
        heading_style = ParagraphStyle(
            "SSHeadingStyle",
            parent    = styles["Heading2"],
            fontSize  = 11,
            textColor = _DARK,
            spaceBefore = 10,
            spaceAfter  = 4,
        )
        sub_style = ParagraphStyle(
            "SSSubStyle",
            parent   = styles["Normal"],
            fontSize = 9,
            textColor = _GRAY,
        )
        body_style = ParagraphStyle(
            "SSBodyStyle",
            parent   = styles["Normal"],
            fontSize = 9,
            leading  = 14,
        )
        small_style = ParagraphStyle(
            "SSSmallStyle",
            parent   = styles["Normal"],
            fontSize = 8,
            textColor = _GRAY,
            leading  = 12,
        )
        disclaimer_style = ParagraphStyle(
            "SSDisclaimerStyle",
            parent   = styles["Normal"],
            fontSize = 8,
            leading  = 12,
            textColor = HexColor("#374151"),
        )

        # ── 1. Header ─────────────────────────────────────────────────────────
        story.append(Paragraph("SynthShield", title_style))
        story.append(Paragraph(
            "Quantum Deepfake &amp; Misinformation Shield — Forensic Analysis Certificate",
            sub_style,
        ))
        story.append(HRFlowable(width="100%", thickness=2, color=_INDIGO,
                                 spaceAfter=8))

        # ── 2. Certificate details ────────────────────────────────────────────
        story.append(Paragraph("Certificate Details", heading_style))
        cert_data = [
            ["Certificate ID:", cert_id],
            ["Generated:",      generated],
        ]
        story.append(self._kv_table(cert_data, body_style))
        story.append(Spacer(1, 8))

        # ── 3. Analyzed file ──────────────────────────────────────────────────
        story.append(HRFlowable(width="100%", thickness=0.5, color=_GRAY, spaceAfter=4))
        story.append(Paragraph("Analyzed File", heading_style))
        size_mb = round(file_info.get("file_size_bytes", 0) / 1_048_576, 3)
        file_data = [
            ["Filename:", file_info.get("filename", "—")],
            ["File Hash (SHA-256):", (file_info.get("file_hash") or "—")[:64]],
            ["Type:", file_info.get("file_type", "—")],
            ["Size:", f"{size_mb} MB"],
        ]
        story.append(self._kv_table(file_data, body_style))
        story.append(Spacer(1, 8))

        # ── 4. Reality Score ──────────────────────────────────────────────────
        story.append(HRFlowable(width="100%", thickness=0.5, color=_GRAY, spaceAfter=4))
        story.append(Paragraph("Reality Score", heading_style))
        story.append(self._score_block(analysis_result))
        story.append(Spacer(1, 8))

        # ── 5. Signal breakdown ───────────────────────────────────────────────
        story.append(HRFlowable(width="100%", thickness=0.5, color=_GRAY, spaceAfter=4))
        story.append(Paragraph("Signal Breakdown", heading_style))
        breakdown = analysis_result.get("signal_breakdown", [])
        if breakdown:
            story.append(self._breakdown_table(breakdown, body_style, small_style))
        else:
            story.append(Paragraph("No signal data available.", small_style))
        story.append(Spacer(1, 8))

        # ── 6. GeoLens section ────────────────────────────────────────────────
        geo = analysis_result.get("geolocation") or {}
        if geo:
            story.append(HRFlowable(width="100%", thickness=0.5, color=_GRAY, spaceAfter=4))
            story.append(Paragraph("Geographic Analysis", heading_style))
            story.append(self._geo_section(geo, body_style, small_style))
            story.append(Spacer(1, 8))

        # ── 7. News verification ──────────────────────────────────────────────
        news = analysis_result.get("news_verification") or {}
        if news:
            story.append(HRFlowable(width="100%", thickness=0.5, color=_GRAY, spaceAfter=4))
            story.append(Paragraph("News Context Verification", heading_style))
            story.append(self._news_section(news, body_style, small_style))
            story.append(Spacer(1, 8))

        # ── 8. Legal disclaimer ───────────────────────────────────────────────
        story.append(HRFlowable(width="100%", thickness=0.5, color=_GRAY, spaceAfter=4))
        story.append(Paragraph("Legal Disclaimer", heading_style))
        story.append(Paragraph(
            "This certificate was generated by SynthShield automated analysis. "
            "It is intended as supporting evidence and should be reviewed by a "
            "qualified forensic expert before use in legal proceedings. "
            "SynthShield makes no warranty as to the completeness or accuracy "
            "of the automated analysis. Results may be affected by image quality, "
            "compression, and the availability of external data sources.",
            disclaimer_style,
        ))
        story.append(Spacer(1, 8))

        # ── 9. Digital signature ──────────────────────────────────────────────
        story.append(HRFlowable(width="100%", thickness=0.5, color=_GRAY, spaceAfter=4))
        story.append(Paragraph("Digital Signature", heading_style))
        sig = _sign_certificate(cert_id, file_info, analysis_result, generated)
        sig_data = [
            ["Certificate ID:", cert_id],
            ["HMAC-SHA256:", sig],
            ["Algorithm:", "HMAC-SHA256 (SECRET_KEY from server environment)"],
        ]
        story.append(self._kv_table(sig_data, small_style))
        story.append(Spacer(1, 8))

        # ── 10. Footer ────────────────────────────────────────────────────────
        story.append(HRFlowable(width="100%", thickness=2, color=_INDIGO, spaceAfter=4))
        story.append(Paragraph(
            f"Generated by SynthShield v1.0 — {generated} | "
            f"Certificate ID: {cert_id}",
            small_style,
        ))

        doc.build(story)
        with open(out_path, "rb") as f:
            pdf_bytes = f.read()

        return pdf_bytes

    # ── Layout helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _kv_table(rows, style):
        t = Table(rows, colWidths=[5 * cm, None])
        t.setStyle(TableStyle([
            ("FONTNAME",  (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME",  (1, 0), (1, -1), "Helvetica"),
            ("FONTSIZE",  (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (0, -1), _DARK),
            ("VALIGN",    (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        return t

    @staticmethod
    def _score_block(result: Dict[str, Any]):
        score   = result.get("reality_score", 50)
        verdict = result.get("verdict", "Inconclusive")
        color   = result.get("color", "gray")
        conf    = result.get("confidence", 0.0)
        vc      = _verdict_color(color)

        score_style = ParagraphStyle(
            "ScoreNum",
            fontName  = "Helvetica-Bold",
            fontSize  = 36,
            textColor = vc,
            alignment = 1,  # centre
        )
        verdict_style = ParagraphStyle(
            "VerdictStr",
            fontName  = "Helvetica-Bold",
            fontSize  = 14,
            textColor = vc,
            alignment = 1,
        )
        conf_style = ParagraphStyle(
            "ConfStr",
            fontName  = "Helvetica",
            fontSize  = 9,
            textColor = _GRAY,
            alignment = 1,
        )

        score_p   = Paragraph(str(score), score_style)
        verdict_p = Paragraph(verdict.upper(), verdict_style)
        conf_p    = Paragraph(f"Confidence: {conf:.0%}", conf_style)

        data = [[score_p], [verdict_p], [conf_p]]
        t = Table(data, colWidths=["100%"])
        t.setStyle(TableStyle([
            ("BOX",        (0, 0), (-1, -1), 1.5, vc),
            ("BACKGROUND", (0, 0), (-1, -1), HexColor("#f9fafb")),
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        return t

    @staticmethod
    def _breakdown_table(breakdown: List[Dict], body_style, small_style):
        header = [
            Paragraph("<b>Signal</b>", body_style),
            Paragraph("<b>Weight</b>", body_style),
            Paragraph("<b>Score</b>", body_style),
            Paragraph("<b>Finding</b>", body_style),
        ]
        rows = [header]
        for row in breakdown:
            fake_pct = round((row.get("fake_score", 0.5)) * 100, 1)
            rows.append([
                Paragraph(row.get("signal", ""), small_style),
                Paragraph(row.get("weight", ""), small_style),
                Paragraph(f"{fake_pct}%", small_style),
                Paragraph(row.get("finding", ""), small_style),
            ])
        t = Table(rows, colWidths=[4.5 * cm, 1.5 * cm, 1.5 * cm, None])
        t.setStyle(TableStyle([
            ("BACKGROUND",  (0, 0), (-1, 0),  _INDIGO),
            ("TEXTCOLOR",   (0, 0), (-1, 0),  colors.white),
            ("FONTNAME",    (0, 0), (-1, 0),  "Helvetica-Bold"),
            ("FONTSIZE",    (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [_LIGHT, colors.white]),
            ("GRID",        (0, 0), (-1, -1), 0.3, _GRAY),
            ("VALIGN",      (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        return t

    @staticmethod
    def _geo_section(geo: Dict, body_style, small_style):
        region   = geo.get("likely_region", "Unknown")
        conf     = geo.get("confidence", 0.0)
        climate  = geo.get("climate_zone", "Unknown")
        cues     = geo.get("visual_cues_detected", [])
        check    = geo.get("claim_check") or {}
        mismatch = check.get("location_mismatch", False)
        details  = check.get("mismatch_details", [])

        rows = [
            ["Estimated Region:", f"{region}  (confidence {conf:.0%})"],
            ["Climate Zone:",     climate],
            ["Location Mismatch:", "YES — see details below" if mismatch else "No mismatch detected"],
        ]
        parts: List = [CertificateGenerator._kv_table(rows, body_style)]
        if cues:
            parts.append(Spacer(1, 4))
            parts.append(Paragraph("Visual cues detected:", small_style))
            for cue in cues[:5]:
                parts.append(Paragraph(f"  • {cue}", small_style))
        if details:
            parts.append(Spacer(1, 4))
            for d in details:
                parts.append(Paragraph(f"  ⚠ {d}", small_style))
        return KeepTogether(parts)

    @staticmethod
    def _news_section(news: Dict, body_style, small_style):
        score   = news.get("context_match_score", 0.5)
        verdict = news.get("verdict", "—")
        sources = news.get("sources_found", [])
        mm_list = news.get("mismatches", [])

        rows = [
            ["Context Match Score:", f"{score:.0%}"],
            ["Verdict:",            verdict],
            ["Sources Found:",      str(len(sources))],
        ]
        parts: List = [CertificateGenerator._kv_table(rows, body_style)]
        if sources:
            parts.append(Spacer(1, 4))
            parts.append(Paragraph("Sources:", small_style))
            for s in sources[:5]:
                title = (s.get("title") or s.get("url") or "")[:80]
                url   = s.get("url", "")
                parts.append(Paragraph(
                    f"  • {title}" + (f" ({url[:60]})" if url else ""),
                    small_style,
                ))
        if mm_list:
            parts.append(Spacer(1, 4))
            parts.append(Paragraph("Mismatches:", small_style))
            for m in mm_list[:3]:
                parts.append(Paragraph(f"  ⚠ {m}", small_style))
        return KeepTogether(parts)

    # ── Fallback: JSON when ReportLab not installed ───────────────────────────

    @staticmethod
    def _fallback_json(cert_id, generated, analysis_result, file_info) -> bytes:
        _UPLOAD_DIR.mkdir(exist_ok=True)
        out = {
            "certificate_id": cert_id,
            "generated": generated,
            "file_info": file_info,
            "analysis_result": analysis_result,
            "note": "PDF generation skipped — reportlab not installed.",
        }
        data = json.dumps(out, indent=2).encode()
        path = _UPLOAD_DIR / f"certificate_{cert_id}.json"
        path.write_bytes(data)
        return data


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════

def _sign_certificate(
    cert_id: str,
    file_info: Dict,
    result: Dict,
    generated: str,
) -> str:
    canonical = json.dumps({
        "cert_id":      cert_id,
        "file_hash":    file_info.get("file_hash", ""),
        "reality_score": result.get("reality_score", 0),
        "verdict":      result.get("verdict", ""),
        "generated":    generated,
    }, sort_keys=True)
    return hmac.new(
        SECRET_KEY.encode(), canonical.encode(), hashlib.sha256
    ).hexdigest()


# ── module-level singleton ────────────────────────────────────────────────────

_generator = CertificateGenerator()


def generate_certificate(
    analysis_result: Dict[str, Any],
    file_info:        Dict[str, Any],
) -> bytes:
    """Entry point for routers."""
    return _generator.generate_certificate(analysis_result, file_info)
