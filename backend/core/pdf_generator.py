"""
backend/core/pdf_generator.py
=============================
Professional medical report generator for the Lung Cancer AI Detection System.

This module produces a polished, hospital-grade PDF report for each patient
scan, including:

  • A dedicated cover page with the lung icon, patient identity block,
    scan metadata, and a "CONFIDENTIAL MEDICAL DOCUMENT" footer band.
  • An Executive Summary card with computed statistics (nodule count,
    maximum AI confidence, status distribution, risk level).
  • Patient Details and Clinical History cards in a clean, modern layout.
  • A Radiological Findings table — one card per nodule, with the
    snapshot image embedded on the left and structured metadata on the right.
  • A Risk Assessment card (Lung-RADS-inspired) with a color-coded
    risk level and rationale.
  • A Final Radiological Impression block (when doctor notes exist).
  • A Recommendations block tailored to the risk level.
  • Page header (patient name + scan id) and footer (page x/y, date,
    "Confidential Medical Report") on every content page.

Design language: "Modern Medical" — teal/cyan primary on white, generous
whitespace, sans-serif typography, subtle borders, color-coded risk states.

Compatibility:
  • Production: Windows backend (uses C:\\Windows\\Fonts\\arial.ttf).
  • Fallback: Linux (DejaVuSans) / macOS (Helvetica) for portability.
  • Pure FPDF2 — no external binary deps beyond fpdf2, arabic_reshaper,
    python-bidi and Pillow (already in requirements).
"""

from __future__ import annotations

import os
import sys
from datetime import datetime
from typing import Any, Iterable, Optional

import arabic_reshaper
from bidi.algorithm import get_display
from fpdf import FPDF

# ----------------------------------------------------------------------
# Palette — "Modern Medical"
# ----------------------------------------------------------------------
PRIMARY = (13, 116, 134)        # #0D7486  deep teal
PRIMARY_DARK = (9, 86, 100)     # darker shade for header bar
ACCENT = (45, 156, 178)         # #2D9CB2  mid teal
ACCENT_LIGHT = (160, 213, 222)  # #A0D5DE  soft teal

BG_CARD = (248, 251, 252)       # near-white card body
BG_CARD_ALT = (240, 247, 249)   # very pale teal for stripes
BG_HIGHLIGHT = (230, 243, 246)  # band behind section titles

BORDER = (210, 224, 230)        # subtle gray-teal border
BORDER_DARK = (175, 200, 210)   # slightly stronger border

TEXT_DARK = (31, 41, 55)        # primary text
TEXT_MID = (75, 85, 99)         # secondary text
TEXT_LIGHT = (140, 152, 164)    # tertiary / captions

# Risk colors
RISK_LOW = (22, 163, 74)        # green
RISK_LOW_BG = (220, 252, 231)
RISK_MOD = (217, 119, 6)        # amber
RISK_MOD_BG = (254, 243, 199)
RISK_HIGH = (220, 38, 38)       # red
RISK_HIGH_BG = (254, 226, 226)
RISK_NONE = (75, 85, 99)
RISK_NONE_BG = (243, 244, 246)

# ----------------------------------------------------------------------
# Typography — auto-detect best available sans-serif font
# ----------------------------------------------------------------------
_FONT_CANDIDATES = [
    # (label, regular_path, bold_path)
    ("Arial",
     r"C:\Windows\Fonts\arial.ttf",
     r"C:\Windows\Fonts\arialbd.ttf"),
    ("DejaVu",  # Linux dev / fallback
     "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("Liberation",
     "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
     "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
]


def _resolve_font_family(pdf: FPDF) -> str:
    """Pick the first available font family and register it with the PDF."""
    for label, regular, bold in _FONT_CANDIDATES:
        if regular and os.path.exists(regular):
            try:
                pdf.add_font(label, "", regular, uni=True)
                if bold and os.path.exists(bold):
                    pdf.add_font(label, "B", bold, uni=True)
                else:
                    pdf.add_font(label, "B", regular, uni=True)
                # Italic fallback (use regular if no italic file)
                pdf.add_font(label, "I", regular, uni=True)
                pdf.add_font(label, "BI", bold if bold and os.path.exists(bold) else regular, uni=True)
                return label
            except Exception:
                continue
    return "helvetica"  # built-in


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def format_text(text: Any) -> str:
    """Reshape Arabic text so it renders correctly inside FPDF cells.

    Non-Arabic text passes through unchanged. Empty/None becomes "N/A".
    """
    if text is None:
        return "N/A"
    text_str = str(text).strip()
    if not text_str:
        return "N/A"
    try:
        # Reshaping is safe for non-Arabic text too, but only meaningful
        # if the string contains Arabic code points.
        if any("\u0600" <= ch <= "\u06FF" for ch in text_str):
            reshaped = arabic_reshaper.reshape(text_str)
            return get_display(reshaped)
        return text_str
    except Exception:
        return text_str


def _fmt_date(scan_date) -> str:
    if not scan_date:
        return datetime.now().strftime("%Y-%m-%d %H:%M")
    try:
        return scan_date.strftime("%Y-%m-%d  %H:%M")
    except Exception:
        return str(scan_date)


def _fmt_date_short(scan_date) -> str:
    if not scan_date:
        return datetime.now().strftime("%Y-%m-%d")
    try:
        return scan_date.strftime("%Y-%m-%d")
    except Exception:
        return str(scan_date)


def _safe(value: Any, default: str = "N/A") -> str:
    if value is None:
        return default
    if isinstance(value, str) and not value.strip():
        return default
    return str(value)


def _safe_float(value: Any, ndigits: int = 1) -> str:
    try:
        return f"{float(value):.{ndigits}f}"
    except (TypeError, ValueError):
        return "N/A"


def _confidence_pct(value: Any) -> float:
    try:
        return round(float(value or 0) * 100, 1)
    except (TypeError, ValueError):
        return 0.0


# ----------------------------------------------------------------------
# Risk assessment (Lung-RADS-inspired heuristic)
# ----------------------------------------------------------------------
def assess_risk(annotations: list) -> dict:
    """Compute a simple risk level based on nodule count, max diameter
    and max AI confidence.

    Returns a dict with:
        level: "None" | "Low" | "Moderate" | "High"
        rationale: list[str] of human-readable reasons
        recommendation: str
    """
    if not annotations:
        return {
            "level": "None",
            "rationale": ["No significant nodules detected or approved."],
            "recommendation": (
                "No actionable radiological findings. Routine clinical "
                "follow-up as indicated by the patient's overall risk "
                "profile."
            ),
        }

    diameters = [float(a.diameter or 0) for a in annotations]
    confs = [float(a.confidence or 0) for a in annotations]
    n = len(annotations)
    max_d = max(diameters)
    max_c = max(confs)
    reasons: list[str] = []

    # High risk triggers
    if max_c >= 0.80:
        reasons.append(f"High AI confidence on at least one nodule ({max_c*100:.1f}%).")
    if max_d >= 8.0:
        reasons.append(f"Largest nodule diameter {max_d:.1f} mm \u2265 8 mm.")
    if n >= 6:
        reasons.append(f"Multiple nodules detected ({n} lesions).")

    if reasons:
        return {
            "level": "High",
            "rationale": reasons,
            "recommendation": (
                "Urgent referral to pulmonology / thoracic surgery is "
                "advised. Consider PET-CT for metabolic characterization "
                "and/or image-guided biopsy for histopathological "
                "confirmation."
            ),
        }

    # Moderate risk triggers
    if max_c >= 0.50:
        reasons.append(f"Moderate AI confidence ({max_c*100:.1f}%).")
    if 6.0 <= max_d < 8.0:
        reasons.append(f"Nodule diameter {max_d:.1f} mm in surveillance range.")
    if 3 <= n < 6:
        reasons.append(f"Several nodules ({n} lesions) warrant closer follow-up.")

    if reasons:
        return {
            "level": "Moderate",
            "rationale": reasons,
            "recommendation": (
                "Short-interval follow-up low-dose CT in 3\u20136 months "
                "recommended to assess for growth or morphological change. "
                "Correlate with clinical findings and patient risk factors."
            ),
        }

    # Default: Low
    if max_c > 0:
        reasons.append(f"Low AI confidence on detected nodules (max {max_c*100:.1f}%).")
    if max_d > 0:
        reasons.append(f"Largest nodule diameter {max_d:.1f} mm < 6 mm.")
    if n > 0:
        reasons.append(f"Few small nodules ({n} lesion{'s' if n>1 else ''}).")

    return {
        "level": "Low",
        "rationale": reasons,
        "recommendation": (
            "Findings are consistent with low-risk nodular disease. "
            "Routine follow-up CT in 12 months as per screening protocol, "
            "or sooner if clinically indicated."
        ),
    }


_RISK_STYLES = {
    "None":     (RISK_NONE, RISK_NONE_BG, "No Significant Risk"),
    "Low":      (RISK_LOW,  RISK_LOW_BG,  "Low Risk"),
    "Moderate": (RISK_MOD,  RISK_MOD_BG,  "Moderate Risk"),
    "High":     (RISK_HIGH, RISK_HIGH_BG, "High Risk"),
}


# ----------------------------------------------------------------------
# PDF class
# ----------------------------------------------------------------------
class MedicalReportPDF(FPDF):
    """A4 portrait medical report with cover page + content pages."""

    # Layout constants (mm)
    MARGIN_L = 12
    MARGIN_R = 12
    MARGIN_T = 14
    CONTENT_W = 186  # 210 - 12 - 12

    def __init__(self, *, patient_name: str, scan_id: str, scan_date_str: str,
                 doctor_name: str, lung_icon_path: Optional[str] = None):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.patient_name = patient_name
        self.scan_id = scan_id
        self.scan_date_str = scan_date_str
        self.doctor_name = doctor_name
        self.lung_icon_path = lung_icon_path if lung_icon_path and os.path.exists(lung_icon_path) else None
        self._on_cover = True   # suppress header/footer on the cover page
        self.font_family_name = _resolve_font_family(self)
        self.set_auto_page_break(auto=True, margin=22)
        self.set_margins(left=self.MARGIN_L, top=self.MARGIN_T, right=self.MARGIN_R)

    # ---------------- header & footer (content pages only) ----------------
    def header(self) -> None:
        if self._on_cover:
            return

        # Thin top accent bar
        self.set_fill_color(*PRIMARY_DARK)
        self.rect(0, 0, 210, 6, style="F")

        # Header row: left = patient identity, right = scan id + date
        self.set_xy(self.MARGIN_L, 9)
        self.set_font(self.font_family_name, "B", 9)
        self.set_text_color(*PRIMARY)
        self.cell(0, 4, "LUNG CANCER AI DETECTION SYSTEM", new_x="LMARGIN", new_y="NEXT")

        self.set_font(self.font_family_name, "", 8.5)
        self.set_text_color(*TEXT_MID)
        patient_line = f"Patient: {self.patient_name[:60]}    |    Scan ID: {self.scan_id[:36]}"
        self.cell(0, 4, patient_line, new_x="LMARGIN", new_y="NEXT")

        # Thin separator
        self.set_draw_color(*BORDER)
        self.set_line_width(0.2)
        self.line(self.MARGIN_L, 20, 210 - self.MARGIN_R, 20)

        # Move below the header for body content
        self.set_xy(self.MARGIN_L, 23)

    def footer(self) -> None:
        if self._on_cover:
            return

        self.set_y(-15)
        self.set_draw_color(*BORDER)
        self.set_line_width(0.2)
        self.line(self.MARGIN_L, self.get_y() - 1, 210 - self.MARGIN_R, self.get_y() - 1)

        self.set_font(self.font_family_name, "", 7.5)
        self.set_text_color(*TEXT_LIGHT)

        left = f"Confidential Medical Report  -  {self.scan_date_str}"
        # {nb} is fpdf2's alias for the total page count — replaced at output() time.
        right = f"Page {self.page_no()} of " + (self.str_alias_nb_pages or "{nb}")
        self.set_x(self.MARGIN_L)
        self.cell(0, 5, left, align="L")

        # right-aligned page number
        self.set_xy(210 - self.MARGIN_R - 40, self.get_y())
        self.cell(40, 5, right, align="R", new_x="LMARGIN", new_y="NEXT")


# ----------------------------------------------------------------------
# Section primitives
# ----------------------------------------------------------------------
def _draw_section_title(pdf: MedicalReportPDF, title: str) -> None:
    """Draw a section title with a colored side bar + thin underline."""
    pdf.ln(2)
    # Colored side bar (4mm tall, 2mm wide)
    bar_x = pdf.MARGIN_L
    bar_y = pdf.get_y()
    pdf.set_fill_color(*PRIMARY)
    pdf.rect(bar_x, bar_y + 0.5, 2, 5.5, style="F")

    # Title text
    pdf.set_xy(bar_x + 4, bar_y)
    pdf.set_font(pdf.font_family_name, "B", 13)
    pdf.set_text_color(*PRIMARY_DARK)
    pdf.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")

    # Underline
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.2)
    pdf.line(pdf.MARGIN_L, pdf.get_y(), 210 - pdf.MARGIN_R, pdf.get_y())
    pdf.ln(3)


def _draw_card(pdf: MedicalReportPDF, draw_body, *, pad: float = 4.0) -> None:
    """Draw a card frame and let draw_body fill it.

    CRITICAL ORDER (previous version had a bug where the card's fill rect
    was painted AFTER the body text, hiding it — text was selectable but
    invisible):
      1. Draw the background fill FIRST (style="F", no border).
      2. Draw the top accent stripe on top of the fill.
      3. Call draw_body() to render the text content.
      4. Draw the border LAST (style="D", no fill) so it doesn't cover text.

    We use a generous height estimate for the initial fill, then draw the
    exact border around the real body height returned by draw_body().
    """
    start_y = pdf.get_y()

    # Step 1: Pre-fill the card background with a generous height estimate.
    # The body functions typically return 15–60 mm; we over-estimate to 120 mm
    # and rely on the page background (white) to naturally clip the visual.
    # The border drawn in step 4 will define the real card edge.
    pdf.set_fill_color(*BG_CARD)
    pdf.rect(pdf.MARGIN_L, start_y, pdf.CONTENT_W, 120, style="F")

    # Step 2: Top accent stripe (sits in the 4mm padding above body content)
    pdf.set_fill_color(*ACCENT_LIGHT)
    pdf.rect(pdf.MARGIN_L, start_y, pdf.CONTENT_W, 1.2, style="F")

    # Step 3: Draw the body content ON TOP of the fill
    pdf.set_xy(pdf.MARGIN_L, start_y)
    body_height = draw_body(pdf)

    # Step 4: Draw ONLY the border (no fill) so text stays visible
    total_h = body_height + pad * 2
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.3)
    pdf.rect(pdf.MARGIN_L, start_y, pdf.CONTENT_W, total_h, style="D")

    # Step 5: Erase any excess fill below the card border by painting white
    # over the area between the card bottom and the generous 120mm estimate.
    excess_y = start_y + total_h
    excess_h = start_y + 120 - excess_y
    if excess_h > 0:
        pdf.set_fill_color(255, 255, 255)
        pdf.rect(pdf.MARGIN_L, excess_y, pdf.CONTENT_W, excess_h, style="F")

    pdf.set_xy(pdf.MARGIN_L, start_y + total_h + 3)


# ----------------------------------------------------------------------
# Cover page
# ----------------------------------------------------------------------
def _cover_centered_cell(pdf: MedicalReportPDF, *, y: float, text: str,
                         font_size: float, font_style: str = "",
                         text_color=TEXT_DARK, h: float = 6.0) -> None:
    """Draw a full-width centered cell on the cover page.

    The cell always starts at x=0 (true page left edge) so the text is
    visually centered on the page. We must call `set_left_margin(0)` /
    `set_right_margin(0)` first because FPDF internally clamps cell
    placement to the document's margins — without that, the "centered"
    text drifts right of true page center.
    """
    pdf.set_left_margin(0)
    pdf.set_right_margin(0)
    pdf.set_xy(0, y)
    pdf.set_font(pdf.font_family_name, font_style, font_size)
    pdf.set_text_color(*text_color)
    pdf.cell(210, h, text, align="C", new_x="LEFT", new_y="NEXT")


def _draw_cover_page(pdf: MedicalReportPDF, *, scan_id: str, scan_date_str: str,
                     doctor_name: str, patient: dict) -> None:
    pdf.add_page()
    pdf._on_cover = True
    # CRITICAL: disable auto-page-break while drawing the cover so the
    # bottom confidential band never overflows onto a phantom 2nd page.
    pdf.set_auto_page_break(False)
    # Use zero margins for the entire cover page so all cells span the
    # full 210 mm width and `align="C"` truly centers on the page.
    pdf.set_left_margin(0)
    pdf.set_right_margin(0)

    page_w = 210
    page_h = 297

    # ---------- top hero band ----------
    band_h = 95
    pdf.set_fill_color(*PRIMARY_DARK)
    pdf.rect(0, 0, page_w, band_h, style="F")

    # Decorative accent strip
    pdf.set_fill_color(*ACCENT)
    pdf.rect(0, band_h - 4, page_w, 4, style="F")

    # Lung icon (centered, top)
    icon_w, icon_h = 30, 30
    icon_x = (page_w - icon_w) / 2
    icon_y = 18
    if pdf.lung_icon_path:
        try:
            pdf.image(pdf.lung_icon_path, x=icon_x, y=icon_y, w=icon_w, h=icon_h)
        except Exception:
            pass
    else:
        # Fallback: simple circle placeholder
        pdf.set_fill_color(*ACCENT_LIGHT)
        pdf.ellipse(icon_x, icon_y, icon_x + icon_w, icon_y + icon_h, style="F")

    # System name + subtitle — each call resets X=0 + margins=0 for true centering
    _cover_centered_cell(pdf, y=icon_y + icon_h + 6,
                         text="LUNG CANCER AI DETECTION SYSTEM",
                         font_size=22, font_style="B",
                         text_color=(255, 255, 255), h=10)
    _cover_centered_cell(pdf, y=icon_y + icon_h + 16,
                         text="Official Radiological & AI Analysis Report",
                         font_size=11, font_style="",
                         text_color=ACCENT_LIGHT, h=7)

    # ---------- patient identity block (centered) ----------
    block_y = band_h + 30
    _cover_centered_cell(pdf, y=block_y,
                         text="PREPARED FOR",
                         font_size=10, font_style="B",
                         text_color=TEXT_LIGHT, h=6)

    # Patient name (big) — shrink font to fit long names within page width
    name_display = (patient.get("name") or "Unknown Patient")
    name_font = 28
    # crude width estimate: ~0.55 * font_size * len(text) in mm
    while name_font > 14 and (0.55 * name_font * len(name_display)) > 195:
        name_font -= 1
    name_display = name_display[:48]
    _cover_centered_cell(pdf, y=block_y + 6,
                         text=format_text(name_display),
                         font_size=name_font, font_style="B",
                         text_color=PRIMARY_DARK, h=13)

    # Sub line: ID tag + age/gender — both truly centered
    tag = patient.get("patient_id_tag") or "-"
    age_gender = f"Age {patient.get('age', 'N/A')}  -  {patient.get('gender', 'N/A')}"
    _cover_centered_cell(pdf, y=block_y + 19,
                         text=f"Hospital ID: {tag}",
                         font_size=11, font_style="",
                         text_color=TEXT_MID, h=6)
    _cover_centered_cell(pdf, y=block_y + 25,
                         text=age_gender,
                         font_size=11, font_style="",
                         text_color=TEXT_MID, h=6)

    # ---------- scan metadata card (centered, narrow) ----------
    meta_y = block_y + 42
    card_w = 130
    card_x = (page_w - card_w) / 2
    card_h = 40
    pdf.set_fill_color(*BG_CARD)
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.3)
    pdf.rect(card_x, meta_y, card_w, card_h, style="FD")
    # Top accent
    pdf.set_fill_color(*ACCENT_LIGHT)
    pdf.rect(card_x, meta_y, card_w, 1.0, style="F")

    # Scan ID, date, doctor (two-column rows inside the card)
    rows = [
        ("Scan ID", scan_id),
        ("Scan Date", scan_date_str),
        ("Reviewed By", f"Dr. {format_text(doctor_name)}"),
    ]
    row_y = meta_y + 7
    for label, value in rows:
        pdf.set_xy(card_x + 8, row_y)
        pdf.set_font(pdf.font_family_name, "B", 9)
        pdf.set_text_color(*TEXT_LIGHT)
        pdf.cell(40, 5, label.upper(), align="L")
        pdf.set_font(pdf.font_family_name, "", 10)
        pdf.set_text_color(*TEXT_DARK)
        pdf.cell(0, 5, str(value)[:36], align="L", new_x="LMARGIN", new_y="NEXT")
        row_y += 11

    # ---------- bottom confidential band ----------
    foot_y = page_h - 38   # reduced from 50 to give text more headroom
    band_h2 = 38
    pdf.set_fill_color(*BG_HIGHLIGHT)
    pdf.rect(0, foot_y, page_w, band_h2, style="F")
    pdf.set_fill_color(*PRIMARY_DARK)
    pdf.rect(0, foot_y, page_w, 3, style="F")

    _cover_centered_cell(pdf, y=foot_y + 9,
                         text="CONFIDENTIAL MEDICAL DOCUMENT",
                         font_size=11, font_style="B",
                         text_color=PRIMARY_DARK, h=6)
    _cover_centered_cell(pdf, y=foot_y + 16,
                         text="This report contains protected health information and is intended solely for the use of the named physician.",
                         font_size=9, font_style="",
                         text_color=TEXT_MID, h=5)
    _cover_centered_cell(pdf, y=foot_y + 22,
                         text="Unauthorized review, dissemination, or copying is strictly prohibited.",
                         font_size=9, font_style="",
                         text_color=TEXT_MID, h=5)

    # Restore margins + auto-page-break for the content pages that follow
    pdf.set_left_margin(pdf.MARGIN_L)
    pdf.set_right_margin(pdf.MARGIN_R)
    pdf.set_auto_page_break(True, margin=22)


# ----------------------------------------------------------------------
# Section: Executive Summary
# ----------------------------------------------------------------------
def _draw_executive_summary(pdf: MedicalReportPDF, *, annotations: list, risk: dict) -> None:
    _draw_section_title(pdf, "Executive Summary")

    # Compute stats
    total = len(annotations)
    approved = sum(1 for a in annotations if (a.status or "").lower() == "approved")
    pending = sum(1 for a in annotations if (a.status or "").lower() == "pending")
    flagged = sum(1 for a in annotations if (a.status or "").lower() == "flagged")
    max_conf = max([_confidence_pct(a.confidence) for a in annotations], default=0.0)

    def _stat_block(x: float, y: float, w: float, h: float, label: str, value: str,
                    value_color=PRIMARY_DARK) -> None:
        pdf.set_fill_color(*BG_CARD_ALT)
        pdf.set_draw_color(*BORDER)
        pdf.set_line_width(0.3)
        pdf.rect(x, y, w, h, style="FD")
        # Accent top stripe
        pdf.set_fill_color(*ACCENT)
        pdf.rect(x, y, w, 1.0, style="F")

        pdf.set_xy(x, y + 6)
        pdf.set_font(pdf.font_family_name, "B", 8)
        pdf.set_text_color(*TEXT_LIGHT)
        pdf.cell(w, 4, label.upper(), align="C", new_x="LMARGIN", new_y="NEXT")

        pdf.set_xy(x, y + 12)
        pdf.set_font(pdf.font_family_name, "B", 18)
        pdf.set_text_color(*value_color)
        pdf.cell(w, 9, value, align="C", new_x="LMARGIN", new_y="NEXT")

    # Row of 4 stat cards
    card_w = (pdf.CONTENT_W - 3 * 4) / 4
    card_h = 25
    base_x = pdf.MARGIN_L
    base_y = pdf.get_y()

    stats = [
        ("Total Nodules", str(total), PRIMARY_DARK),
        ("Max AI Confidence", f"{max_conf:.1f}%", ACCENT),
        ("Approved", str(approved), RISK_LOW),
        ("Pending Review", str(pending + flagged), RISK_MOD),
    ]
    for i, (label, value, color) in enumerate(stats):
        _stat_block(base_x + i * (card_w + 4), base_y, card_w, card_h, label, value, color)

    pdf.set_xy(pdf.MARGIN_L, base_y + card_h + 4)

    # Risk level strip
    risk_color, risk_bg, risk_label = _RISK_STYLES[risk["level"]]
    risk_h = 18
    rx = pdf.MARGIN_L
    ry = pdf.get_y()
    pdf.set_fill_color(*risk_bg)
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.3)
    pdf.rect(rx, ry, pdf.CONTENT_W, risk_h, style="FD")
    # Left colored bar
    pdf.set_fill_color(*risk_color)
    pdf.rect(rx, ry, 4, risk_h, style="F")

    pdf.set_xy(rx + 8, ry + 3)
    pdf.set_font(pdf.font_family_name, "B", 9)
    pdf.set_text_color(*TEXT_LIGHT)
    pdf.cell(40, 4, "OVERALL RISK LEVEL", align="L")

    pdf.set_xy(rx + 8, ry + 8)
    pdf.set_font(pdf.font_family_name, "B", 12)
    pdf.set_text_color(*risk_color)
    pdf.cell(60, 5, risk_label, align="L")

    # Rationale summary (truncated to one line)
    rationale_short = "  -  ".join(risk["rationale"])
    if len(rationale_short) > 140:
        rationale_short = rationale_short[:137] + "..."
    pdf.set_xy(rx + 75, ry + 6)
    pdf.set_font(pdf.font_family_name, "", 9)
    pdf.set_text_color(*TEXT_MID)
    pdf.multi_cell(pdf.CONTENT_W - 75 - 4, 4, rationale_short, align="L")

    pdf.set_xy(pdf.MARGIN_L, ry + risk_h + 4)


# ----------------------------------------------------------------------
# Section: Patient Details + Clinical History (side-by-side compact cards)
# ----------------------------------------------------------------------
def _kv_row(pdf: MedicalReportPDF, x: float, y: float, w: float, label: str, value: str,
            label_w: float = 28) -> float:
    """Draw a single key:value row, return the next y."""
    pdf.set_xy(x, y)
    pdf.set_font(pdf.font_family_name, "B", 9)
    pdf.set_text_color(*TEXT_LIGHT)
    pdf.cell(label_w, 5, label, align="L")
    pdf.set_font(pdf.font_family_name, "", 9.5)
    pdf.set_text_color(*TEXT_DARK)
    pdf.multi_cell(w - label_w, 5, format_text(value), align="L", new_x="LMARGIN", new_y="NEXT")
    return pdf.get_y()


def _draw_patient_details(pdf: MedicalReportPDF, *, patient: dict) -> None:
    _draw_section_title(pdf, "Patient Details")

    def body(p: MedicalReportPDF) -> float:
        start_y = p.get_y()
        # Two-column layout: left = identity, right = smoking
        col_w = (p.CONTENT_W - 6) / 2
        left_x = p.MARGIN_L + 3
        right_x = left_x + col_w + 6

        # Left column
        y = start_y + 2
        y = _kv_row(p, left_x, y, col_w, "Full Name", patient.get("name"))
        y = _kv_row(p, left_x, y, col_w, "Hospital ID", patient.get("patient_id_tag"))
        y = _kv_row(p, left_x, y, col_w, "Age", patient.get("age"))
        y = _kv_row(p, left_x, y, col_w, "Gender", patient.get("gender"))

        # Right column - smoking status
        smoker = "Yes" if patient.get("is_smoker") else "No"
        if patient.get("is_smoker"):
            if patient.get("pack_years"):
                smoker += f"  ({patient.get('pack_years')} pack-years)"
            if patient.get("smoking_cessation_date"):
                smoker += f"  -  Quit: {format_text(patient.get('smoking_cessation_date'))}"

        y2 = start_y + 2
        y2 = _kv_row(p, right_x, y2, col_w, "Smoker", smoker)
        # Symptoms / exposures summary line
        symptoms = []
        if patient.get("has_previous_tumors"):
            symptoms.append("Previous Tumors")
        if patient.get("occupational_exposure"):
            symptoms.append("Occupational Exposure")
        if patient.get("chest_pain_complaint"):
            symptoms.append("Chest Pain")
        if patient.get("chronic_cough"):
            symptoms.append("Chronic Cough")
        if patient.get("coughing_blood"):
            symptoms.append("Hemoptysis")
        if patient.get("weight_loss"):
            symptoms.append("Weight Loss")
        symptoms_str = ", ".join(symptoms) if symptoms else "None reported"
        y2 = _kv_row(p, right_x, y2, col_w, "Symptoms", symptoms_str)

        # Use the larger of the two column heights
        body_h = max(y, y2) - start_y
        return body_h

    _draw_card(pdf, body, pad=4)


def _draw_clinical_history(pdf: MedicalReportPDF, *, patient: dict) -> None:
    _draw_section_title(pdf, "Clinical History")

    def body(p: MedicalReportPDF) -> float:
        start_y = p.get_y()

        # Build symptom+detail rows
        symptom_items = []
        if patient.get("has_previous_tumors"):
            d = patient.get("prev_tumors_details")
            symptom_items.append(("Previous Tumors", d))
        if patient.get("occupational_exposure"):
            d = patient.get("occ_exposure_details")
            symptom_items.append(("Occupational Exposure", d))
        if patient.get("chest_pain_complaint"):
            d = patient.get("chest_pain_details")
            symptom_items.append(("Chest Pain", d))
        if patient.get("chronic_cough"):
            d = patient.get("chronic_cough_details")
            symptom_items.append(("Chronic Cough", d))
        if patient.get("coughing_blood"):
            d = patient.get("coughing_blood_details")
            symptom_items.append(("Hemoptysis", d))
        if patient.get("weight_loss"):
            d = patient.get("weight_loss_details")
            symptom_items.append(("Weight Loss", d))

        x = p.MARGIN_L + 3
        y = start_y + 2
        col_w = p.CONTENT_W - 6

        if not symptom_items:
            p.set_xy(x, y)
            p.set_font(p.font_family_name, "I", 9.5)
            p.set_text_color(*TEXT_MID)
            p.cell(col_w, 5, "No symptoms or exposures reported.", align="L", new_x="LMARGIN", new_y="NEXT")
            y = p.get_y() + 1
        else:
            for label, detail in symptom_items:
                p.set_xy(x, y)
                # Bullet
                p.set_font(p.font_family_name, "B", 9)
                p.set_text_color(*ACCENT)
                p.cell(5, 5, "\u25CF", align="L")
                # Label
                p.set_font(p.font_family_name, "B", 9.5)
                p.set_text_color(*TEXT_DARK)
                p.cell(45, 5, label + ":", align="L")
                # Detail
                p.set_font(p.font_family_name, "", 9.5)
                p.set_text_color(*TEXT_MID)
                detail_txt = format_text(detail) if detail else "Reported (no further details)"
                p.multi_cell(col_w - 50, 5, detail_txt, align="L", new_x="LMARGIN", new_y="NEXT")
                y = p.get_y() + 1

        # Previous chest diseases
        if patient.get("previous_chest_diseases"):
            y = _kv_row(p, x, y, col_w, "Previous Chest Diseases", patient.get("previous_chest_diseases"), label_w=55)

        # Family history
        if patient.get("family_history"):
            y = _kv_row(p, x, y, col_w, "Family History", patient.get("family_history"), label_w=55)

        body_h = y - start_y
        return body_h

    _draw_card(pdf, body, pad=4)


# ----------------------------------------------------------------------
# Section: Radiological Findings — nodule cards
# ----------------------------------------------------------------------
def _status_color(status: Optional[str]) -> tuple:
    s = (status or "").lower()
    if s == "approved":
        return RISK_LOW
    if s == "pending":
        return RISK_MOD
    if s == "flagged" or s == "rejected":
        return RISK_HIGH
    return TEXT_MID


def _draw_nodule_card(pdf: MedicalReportPDF, *, idx: int, ann, scan_id: str,
                      snapshots_dir: str, card_w: float) -> None:
    """Draw a single nodule card.

    Layout (top-down inside the card):
        ┌───────────────────────────────────────────────────────────┐
        │ [IMG]  Nodule #N                              [STATUS PILL]│   ← header row (h=8)
        │       ┌─────────┬─────────┬─────────┐                       │
        │ [IMG] │ SLICE   │ AI CONF │ DIAM    │                       │   ← stat row 1 (h=14)
        │       │ 87      │ 91.0%   │ 9.2 mm  │                       │
        │       ├─────────┼─────────┼─────────┤                       │
        │       │ COORDS  │ RANGE   │ SOURCE  │                       │   ← stat row 2 (h=14)
        │       │ (142,99)│ 85→89   │ AI      │                       │
        └───────────────────────────────────────────────────────────┘

    Total card height = 8 (header) + 28 (2 stat rows × 14) + 4 (padding) = 40 mm.
    The previous 32 mm card cut off the 3rd row of labels/values, causing
    overlap with the next nodule card.
    """
    card_h = 40
    x = pdf.MARGIN_L
    y = pdf.get_y()

    # ----- Card background + border -----
    pdf.set_fill_color(*BG_CARD)
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.3)
    pdf.rect(x, y, card_w, card_h, style="FD")
    # Left accent stripe (color-coded by status)
    pdf.set_fill_color(*_status_color(ann.status))
    pdf.rect(x, y, 1.5, card_h, style="F")

    # ----- Snapshot image (left side, vertically centered) -----
    img_w = 28
    img_h = 28
    img_x = x + 4
    img_y = y + (card_h - img_h) / 2  # vertically centered
    img_path = os.path.join(snapshots_dir, f"scan_{scan_id}_nodule_{ann.id}.png")
    img_drawn = False
    if os.path.exists(img_path):
        try:
            pdf.image(img_path, x=img_x, y=img_y, w=img_w, h=img_h)
            img_drawn = True
        except Exception:
            img_drawn = False
    if not img_drawn:
        # Placeholder square
        pdf.set_fill_color(*BG_CARD_ALT)
        pdf.rect(img_x, img_y, img_w, img_h, style="F")
        pdf.set_draw_color(*BORDER_DARK)
        pdf.rect(img_x, img_y, img_w, img_h, style="D")
        pdf.set_xy(img_x, img_y + img_h / 2 - 2)
        pdf.set_font(pdf.font_family_name, "I", 7)
        pdf.set_text_color(*TEXT_LIGHT)
        pdf.cell(img_w, 4, "no image", align="C")

    # ----- Right text region -----
    text_x = img_x + img_w + 5
    text_w = (x + card_w) - text_x - 3  # right padding of 3mm

    # ===== Header row (Nodule #N + status pill) =====
    header_y = y + 3
    pdf.set_xy(text_x, header_y)
    pdf.set_font(pdf.font_family_name, "B", 11)
    pdf.set_text_color(*PRIMARY_DARK)
    pdf.cell(text_w * 0.55, 5, f"Nodule #{idx}", align="L")

    # Status pill (right-aligned within header row)
    status_str = (ann.status or "Pending")
    pdf.set_xy(text_x + text_w * 0.55, header_y)
    pdf.set_font(pdf.font_family_name, "B", 8.5)
    pdf.set_text_color(*_status_color(ann.status))
    pdf.cell(text_w * 0.45, 5, status_str.upper(), align="R")

    # ===== 3-column × 2-row stat grid =====
    # Compute column geometry
    grid_y = y + 11          # top of row 1 labels
    row1_value_y = y + 15    # top of row 1 values
    row2_label_y = y + 22    # top of row 2 labels
    row2_value_y = y + 26    # top of row 2 values

    col_gap = 4
    col_w = (text_w - 2 * col_gap) / 3
    col1_x = text_x
    col2_x = text_x + col_w + col_gap
    col3_x = text_x + 2 * (col_w + col_gap)

    def _stat_cell(col_x: float, label_y: float, value_y: float,
                   label: str, value: str, value_color=TEXT_DARK,
                   value_font_size: float = 10.0,
                   value_style: str = "") -> None:
        """Draw a single mini stat cell (label above value)."""
        # Label
        pdf.set_xy(col_x, label_y)
        pdf.set_font(pdf.font_family_name, "B", 7.5)
        pdf.set_text_color(*TEXT_LIGHT)
        pdf.cell(col_w, 3.5, label, align="L")
        # Value
        pdf.set_xy(col_x, value_y)
        pdf.set_font(pdf.font_family_name, value_style, value_font_size)
        pdf.set_text_color(*value_color)
        pdf.cell(col_w, 4, value, align="L")

    # Row 1: Slice | AI Confidence | Diameter
    conf_pct = _confidence_pct(ann.confidence)
    conf_color = _status_color(ann.status) if ann.confidence and ann.confidence >= 0.7 else TEXT_DARK
    _stat_cell(col1_x, grid_y, row1_value_y,
               "SLICE", str(ann.slice_number))
    _stat_cell(col2_x, grid_y, row1_value_y,
               "AI CONFIDENCE", f"{conf_pct:.1f}%",
               value_color=conf_color, value_font_size=10)
    _stat_cell(col3_x, grid_y, row1_value_y,
               "DIAMETER", f"{_safe_float(ann.diameter)} mm")

    # Row 2: Coordinates | Slice Range | Source
    coords_str = f"({_safe_float(ann.coord_x)}, {_safe_float(ann.coord_y)})"
    if ann.start_slice is not None and ann.end_slice is not None:
        range_str = f"{ann.start_slice} \u2192 {ann.end_slice}"
    elif ann.start_slice is not None:
        range_str = f"from {ann.start_slice}"
    elif ann.end_slice is not None:
        range_str = f"to {ann.end_slice}"
    else:
        range_str = "single"
    source_str = (ann.source or "AI")
    _stat_cell(col1_x, row2_label_y, row2_value_y,
               "COORDINATES (X, Y)", coords_str)
    _stat_cell(col2_x, row2_label_y, row2_value_y,
               "SLICE RANGE", range_str)
    _stat_cell(col3_x, row2_label_y, row2_value_y,
               "SOURCE", source_str)

    # Advance cursor to just below this card (with a small gap)
    pdf.set_xy(pdf.MARGIN_L, y + card_h + 3)


def _draw_radiological_findings(pdf: MedicalReportPDF, *, scan_id: str,
                                annotations: list, snapshots_dir: str) -> None:
    _draw_section_title(pdf, "Radiological Findings")

    sorted_anns = sorted(annotations, key=lambda a: (a.slice_number or 0))

    if not sorted_anns:
        # Empty-state card
        def body(p: MedicalReportPDF) -> float:
            start_y = p.get_y()
            p.set_xy(p.MARGIN_L + 6, start_y + 4)
            p.set_font(p.font_family_name, "I", 11)
            p.set_text_color(*TEXT_MID)
            p.multi_cell(p.CONTENT_W - 12, 6,
                         "No significant nodules were detected or approved for this scan.",
                         align="C")
            return p.get_y() - start_y + 2
        _draw_card(pdf, body, pad=4)
        return

    # Header row (column captions above the cards)
    card_w = pdf.CONTENT_W
    img_x = pdf.MARGIN_L + 4
    text_x = img_x + 28 + 5   # matches the new img_w=28 + 5 gap inside _draw_nodule_card

    pdf.set_font(pdf.font_family_name, "B", 8)
    pdf.set_text_color(*TEXT_LIGHT)
    pdf.set_xy(img_x, pdf.get_y())
    pdf.cell(28, 4, "SNAPSHOT", align="L")
    pdf.set_xy(text_x, pdf.get_y())
    pdf.cell(0, 4, "NODULE DETAILS", align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    for i, ann in enumerate(sorted_anns, start=1):
        # Page break before drawing a card if not enough vertical space.
        # Card height is 40mm, so we need at least ~50mm of room.
        if pdf.get_y() > 240:
            pdf.add_page()
        _draw_nodule_card(pdf, idx=i, ann=ann, scan_id=scan_id,
                          snapshots_dir=snapshots_dir, card_w=card_w)


# ----------------------------------------------------------------------
# Section: Risk Assessment
# ----------------------------------------------------------------------
def _draw_risk_assessment(pdf: MedicalReportPDF, *, risk: dict) -> None:
    _draw_section_title(pdf, "Risk Assessment")

    risk_color, risk_bg, risk_label = _RISK_STYLES[risk["level"]]

    def body(p: MedicalReportPDF) -> float:
        start_y = p.get_y()
        x = p.MARGIN_L + 3
        w = p.CONTENT_W - 6

        # Big colored "RISK LEVEL" badge
        badge_w = 60
        badge_h = 22
        badge_x = x
        badge_y = start_y + 3
        p.set_fill_color(*risk_bg)
        p.set_draw_color(*risk_color)
        p.set_line_width(0.4)
        p.rect(badge_x, badge_y, badge_w, badge_h, style="FD")
        # Left colored bar
        p.set_fill_color(*risk_color)
        p.rect(badge_x, badge_y, 3, badge_h, style="F")
        # Badge text
        p.set_xy(badge_x, badge_y + 3)
        p.set_font(p.font_family_name, "B", 8)
        p.set_text_color(*TEXT_LIGHT)
        p.cell(badge_w - 3, 4, "OVERALL RISK", align="C", new_x="LMARGIN", new_y="NEXT")
        p.set_xy(badge_x, badge_y + 9)
        p.set_font(p.font_family_name, "B", 13)
        p.set_text_color(*risk_color)
        p.cell(badge_w - 3, 6, risk_label, align="C", new_x="LMARGIN", new_y="NEXT")

        # Rationale column
        rationale_x = badge_x + badge_w + 6
        rationale_w = w - badge_w - 6
        p.set_xy(rationale_x, start_y + 3)
        p.set_font(p.font_family_name, "B", 8)
        p.set_text_color(*TEXT_LIGHT)
        p.cell(rationale_w, 4, "RATIONALE", align="L", new_x="LMARGIN", new_y="NEXT")

        ry = p.get_y()
        for r in risk["rationale"]:
            p.set_xy(rationale_x, ry)
            p.set_font(p.font_family_name, "B", 9)
            p.set_text_color(*ACCENT)
            p.cell(4, 4, "\u25B8", align="L")
            p.set_font(p.font_family_name, "", 9.5)
            p.set_text_color(*TEXT_DARK)
            p.multi_cell(rationale_w - 4, 4.5, r, align="L", new_x="LMARGIN", new_y="NEXT")
            ry = p.get_y() + 0.5

        # Recommendation band (full width, below)
        rec_y = max(badge_y + badge_h + 4, ry + 2)
        p.set_xy(x, rec_y)
        p.set_fill_color(*BG_HIGHLIGHT)
        p.set_draw_color(*BORDER)
        p.set_line_width(0.3)
        rec_h = 18
        p.rect(x, rec_y, w, rec_h, style="FD")
        # Left bar
        p.set_fill_color(*PRIMARY)
        p.rect(x, rec_y, 3, rec_h, style="F")

        p.set_xy(x + 6, rec_y + 3)
        p.set_font(p.font_family_name, "B", 8)
        p.set_text_color(*PRIMARY_DARK)
        p.cell(w - 8, 4, "RECOMMENDATION", align="L", new_x="LMARGIN", new_y="NEXT")
        p.set_xy(x + 6, rec_y + 8)
        p.set_font(p.font_family_name, "", 9.5)
        p.set_text_color(*TEXT_DARK)
        p.multi_cell(w - 8, 4.5, risk["recommendation"], align="L")

        return (rec_y + rec_h) - start_y

    _draw_card(pdf, body, pad=4)


# ----------------------------------------------------------------------
# Section: Final Radiological Impression
# ----------------------------------------------------------------------
def _draw_impression(pdf: MedicalReportPDF, *, doctor_notes: Optional[str]) -> None:
    if not doctor_notes:
        return

    _draw_section_title(pdf, "Final Radiological Impression")

    def body(p: MedicalReportPDF) -> float:
        start_y = p.get_y()
        x = p.MARGIN_L + 4
        w = p.CONTENT_W - 8
        p.set_xy(x, start_y + 2)
        p.set_font(p.font_family_name, "", 10)
        p.set_text_color(*TEXT_DARK)
        p.multi_cell(w, 5, format_text(doctor_notes), align="L")
        return p.get_y() - start_y + 2

    _draw_card(pdf, body, pad=4)


# ----------------------------------------------------------------------
# Public entrypoint
# ----------------------------------------------------------------------
def create_pdf_report(scan_id: str, scan_date, doctor_name: str, patient: dict,
                      annotations: list, snapshots_dir: str,
                      output_path: str) -> str:
    """Generate a professional medical PDF report.

    Args:
        scan_id: The Scan primary key (UUID string).
        scan_date: A datetime object (timezone-aware) for the scan.
        doctor_name: Reviewing physician name (without "Dr." prefix).
        patient: dict with the patient payload (see reports.get_patient_payload).
        annotations: list of SQLAlchemy Annotation rows (status != "Rejected").
        snapshots_dir: folder containing scan_{scan_id}_nodule_{id}.png files.
        output_path: absolute path of the PDF file to produce.

    Returns:
        The output_path on success.
    """
    # Resolve lung icon (bundled alongside this module)
    module_dir = os.path.dirname(os.path.abspath(__file__))
    icon_candidates = [
        os.path.join(module_dir, "assets", "lung_icon.png"),
        os.path.join(module_dir, "lung_icon.png"),
        os.path.join(module_dir, "..", "assets", "lung_icon.png"),
        "/home/z/my-project/download/lung_icon.png",  # dev preview path
    ]
    icon_path = next((p for p in icon_candidates if os.path.exists(p)), None)

    patient_name = patient.get("name") or "Unknown Patient"
    scan_date_str = _fmt_date(scan_date)

    pdf = MedicalReportPDF(
        patient_name=patient_name,
        scan_id=scan_id,
        scan_date_str=scan_date_str,
        doctor_name=doctor_name,
        lung_icon_path=icon_path,
    )
    pdf.alias_nb_pages()  # enables {nb} placeholder for total page count
    pdf.set_title(f"Medical Report - {patient_name}")
    pdf.set_author(f"Dr. {doctor_name}")
    pdf.set_subject("Lung Cancer AI Detection Report")
    pdf.set_creator("Lung Cancer AI Detection System")

    # --- Page 1: cover ---
    _draw_cover_page(pdf, scan_id=scan_id, scan_date_str=scan_date_str,
                     doctor_name=doctor_name, patient=patient)

    # --- Page 2+: content ---
    pdf.add_page()
    pdf._on_cover = False  # enable header/footer on subsequent pages

    # Compute risk
    risk = assess_risk(annotations)

    # Top of first content page: small "Generated on" line
    pdf.set_xy(pdf.MARGIN_L, 24)
    pdf.set_font(pdf.font_family_name, "", 8.5)
    pdf.set_text_color(*TEXT_LIGHT)
    pdf.cell(0, 4,
             f"Report generated on {datetime.now().strftime('%Y-%m-%d %H:%M')}  -  Reviewed by Dr. {format_text(doctor_name)}",
             align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # Executive Summary
    _draw_executive_summary(pdf, annotations=annotations, risk=risk)

    # Patient Details
    _draw_patient_details(pdf, patient=patient)

    # Clinical History
    _draw_clinical_history(pdf, patient=patient)

    # Radiological Findings (page-break aware)
    _draw_radiological_findings(pdf, scan_id=scan_id,
                                annotations=annotations, snapshots_dir=snapshots_dir)

    # Risk Assessment (force a page break if too low)
    if pdf.get_y() > 220:
        pdf.add_page()
    _draw_risk_assessment(pdf, risk=risk)

    # Final Impression (if doctor_notes)
    if patient.get("doctor_notes"):
        if pdf.get_y() > 230:
            pdf.add_page()
        _draw_impression(pdf, doctor_notes=patient.get("doctor_notes"))

    # Ensure output dir exists
    out_dir = os.path.dirname(output_path)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    pdf.output(output_path)
    return output_path