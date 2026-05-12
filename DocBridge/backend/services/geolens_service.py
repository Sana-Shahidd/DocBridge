"""
GeoLens Service — offline visual geolocation for misinformation detection.

Analyses visual cues in images to estimate geographic origin and time period:
  • Vegetation type (HSV colour histograms — vivid vs muted green)
  • Dominant colour palette → climate zone
  • Sky brightness + hue → time of day
  • Architecture edge patterns and dome/arch contour detection
  • Road marking colours (yellow = North American, white = European/Asian)
  • Text-blob aspect ratios → script family (CJK / Arabic / Latin)
  • Image quality indicators → approximate decade

All processing is fully offline (OpenCV + numpy + scikit-image only).
"""

import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

try:
    import cv2
    _CV2 = True
except ImportError:
    _CV2 = False

try:
    from PIL import Image
    _PIL = True
except ImportError:
    _PIL = False


# ── Region keyword lookup (for cross-checking user-supplied location text) ────

_REGION_KEYWORDS: Dict[str, List[str]] = {
    "Middle East / North Africa": [
        "middle east", "mena", "arab", "saudi", "egypt", "iran", "iraq",
        "turkey", "tunisia", "morocco", "algeria", "jordan", "lebanon",
        "syria", "gulf", "dubai", "abu dhabi", "riyadh", "cairo", "oman",
        "kuwait", "bahrain", "qatar", "yemen", "libya",
    ],
    "South Asia": [
        "south asia", "india", "pakistan", "bangladesh", "nepal", "sri lanka",
        "delhi", "mumbai", "karachi", "lahore", "dhaka", "kathmandu",
        "islamabad", "chennai", "kolkata", "hyderabad",
    ],
    "Southeast Asia": [
        "southeast asia", "thailand", "vietnam", "indonesia", "malaysia",
        "philippines", "singapore", "cambodia", "myanmar", "bangkok",
        "jakarta", "manila", "ho chi minh", "hanoi", "kuala lumpur",
    ],
    "East Asia": [
        "east asia", "china", "japan", "korea", "taiwan", "hong kong",
        "beijing", "shanghai", "tokyo", "seoul", "taipei", "osaka",
    ],
    "Western Europe": [
        "western europe", "europe", "france", "germany", "uk", "italy",
        "spain", "netherlands", "paris", "london", "berlin", "rome",
        "madrid", "amsterdam", "vienna", "brussels", "zurich", "ireland",
        "portugal", "sweden", "norway", "denmark", "finland",
    ],
    "North America": [
        "north america", "usa", "united states", "canada", "america",
        "new york", "los angeles", "chicago", "toronto", "vancouver",
        "houston", "washington", "dallas", "miami", "boston",
    ],
    "Latin America": [
        "latin america", "south america", "brazil", "mexico", "argentina",
        "colombia", "chile", "peru", "venezuela", "sao paulo",
        "buenos aires", "bogota", "lima", "mexico city",
    ],
    "Central/Eastern Europe": [
        "eastern europe", "russia", "ukraine", "poland", "czech", "hungary",
        "romania", "bulgaria", "moscow", "warsaw", "kyiv", "kiev",
        "prague", "budapest", "bucharest",
    ],
    "Sub-Saharan Africa": [
        "africa", "nigeria", "kenya", "ghana", "ethiopia", "tanzania",
        "lagos", "nairobi", "accra", "addis ababa", "johannesburg",
        "south africa", "cameroon", "senegal",
    ],
    "Oceania / Australia": [
        "australia", "new zealand", "oceania", "sydney", "melbourne",
        "auckland", "brisbane", "perth",
    ],
    "Polar / Arctic": [
        "arctic", "antarctic", "polar", "greenland", "iceland", "alaska",
        "scandinavia", "norway", "sweden", "finland",
    ],
}

# Decade label table (upper year bound → label)
_DECADE_MAP: List[Tuple[int, str]] = [
    (1960, "1940s–1960s"),
    (1975, "1960s–1970s"),
    (1985, "1970s–1980s"),
    (1995, "1980s–1990s"),
    (2005, "1990s–2000s"),
    (2015, "2000s–2010s"),
    (2022, "2010s–2020s"),
    (9999, "2020s–Present"),
]


# ═════════════════════════════════════════════════════════════════════════════
# GeoLensService
# ═════════════════════════════════════════════════════════════════════════════

class GeoLensService:

    # ── 1. Geolocation from visual cues ──────────────────────────────────────

    def analyze_geolocation(self, image_path: str) -> Dict[str, Any]:
        """
        Extract visual geographic cues from an image and estimate its origin region.

        Returns
        -------
        {
            "likely_region":          str,
            "confidence":             float,
            "visual_cues_detected":   list[str],
            "estimated_time_of_day":  str,
            "climate_zone":           str,
            "region_scores":          dict,
        }
        """
        if not Path(image_path).exists():
            return _geo_error("File not found.")
        if not _CV2:
            return _geo_unavailable("OpenCV not installed.")

        img_bgr = cv2.imread(image_path)
        if img_bgr is None:
            return _geo_error("Could not decode image.")

        h, w = img_bgr.shape[:2]
        img_hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)

        all_cues: List[str] = []
        votes: Dict[str, float] = {}

        # a. Vegetation
        cues_v, votes_v = self._analyze_vegetation(img_hsv, h, w)
        all_cues.extend(cues_v)
        _add_votes(votes, votes_v)

        # b. Colour palette → climate zone
        climate_zone, cues_p, votes_p = self._analyze_palette(img_hsv, h, w)
        all_cues.extend(cues_p)
        _add_votes(votes, votes_p)

        # c. Sky → time of day
        time_of_day, cues_s = self._analyze_sky(img_bgr, img_hsv, h, w)
        all_cues.extend(cues_s)

        # d. Architecture
        cues_a, votes_a = self._analyze_architecture(img_bgr, h, w)
        all_cues.extend(cues_a)
        _add_votes(votes, votes_a)

        # e. Road markings
        cues_r, votes_r = self._analyze_roads(img_bgr, img_hsv, h, w)
        all_cues.extend(cues_r)
        _add_votes(votes, votes_r)

        # f. Signage / script
        cues_sg, votes_sg = self._detect_signage(img_bgr)
        all_cues.extend(cues_sg)
        _add_votes(votes, votes_sg)

        # Aggregate
        if votes:
            total        = sum(votes.values())
            likely_region = max(votes, key=votes.get)
            top          = votes[likely_region]
            confidence   = round(float(np.clip(top / max(total, 1e-9), 0.0, 1.0)), 3)
        else:
            likely_region = "Unknown"
            confidence    = 0.0

        return {
            "likely_region":         likely_region,
            "confidence":            confidence,
            "visual_cues_detected":  list(dict.fromkeys(all_cues)),  # deduplicated, ordered
            "estimated_time_of_day": time_of_day,
            "climate_zone":          climate_zone,
            "region_scores":         {k: round(v, 3)
                                      for k, v in sorted(votes.items(), key=lambda x: -x[1])},
        }

    # ── Vegetation ────────────────────────────────────────────────────────────

    def _analyze_vegetation(
        self, img_hsv: np.ndarray, h: int, w: int
    ) -> Tuple[List[str], Dict[str, float]]:
        total_px = h * w
        cues: List[str] = []
        votes: Dict[str, float] = {}

        # All greens (H: 35–85 in OpenCV's 0–179 scale)
        green_px  = cv2.countNonZero(
            cv2.inRange(img_hsv, np.array([35, 35, 35]), np.array([85, 255, 255])))
        green_r   = green_px / total_px

        # Vivid tropical greens (high saturation)
        vivid_px  = cv2.countNonZero(
            cv2.inRange(img_hsv, np.array([40, 100, 60]), np.array([80, 255, 255])))
        vivid_r   = vivid_px / total_px

        if green_r > 0.25:
            if vivid_r > 0.12:
                cues.append("Dense tropical/subtropical vegetation — vivid-green foliage")
                for r, v in [("South Asia", 1.5), ("Southeast Asia", 1.5),
                             ("Latin America", 1.0), ("Sub-Saharan Africa", 1.0)]:
                    votes[r] = votes.get(r, 0) + v
            else:
                cues.append("Temperate vegetation — muted-green grass or trees")
                for r, v in [("Western Europe", 1.5), ("North America", 1.0),
                             ("Central/Eastern Europe", 1.0), ("Oceania / Australia", 0.7)]:
                    votes[r] = votes.get(r, 0) + v
        elif green_r < 0.05:
            cues.append("Sparse vegetation — arid or high-density urban environment")
            votes["Middle East / North Africa"] = votes.get("Middle East / North Africa", 0) + 0.8
        return cues, votes

    # ── Colour palette / climate zone ─────────────────────────────────────────

    def _analyze_palette(
        self, img_hsv: np.ndarray, h: int, w: int
    ) -> Tuple[str, List[str], Dict[str, float]]:
        total_px = h * w
        cues: List[str] = []
        votes: Dict[str, float] = {}

        sand_px  = cv2.countNonZero(
            cv2.inRange(img_hsv, np.array([10, 30, 100]), np.array([25, 200, 255])))
        snow_px  = cv2.countNonZero(
            cv2.inRange(img_hsv, np.array([0,  0, 200]),  np.array([179, 40, 255])))
        gray_px  = cv2.countNonZero(
            cv2.inRange(img_hsv, np.array([0,  0, 60]),   np.array([179, 40, 200])))

        sand_r = sand_px / total_px
        snow_r = snow_px / total_px
        gray_r = gray_px / total_px

        if snow_r > 0.25:
            climate_zone = "Polar / Arctic"
            cues.append("Dominant white/snow palette — polar or high-altitude region")
            votes["Polar / Arctic"] = 2.0
        elif sand_r > 0.15:
            climate_zone = "Desert / Arid"
            cues.append("Warm sandy/ochre palette — desert or arid region")
            votes["Middle East / North Africa"] = votes.get("Middle East / North Africa", 0) + 1.5
            votes["South Asia"]                 = votes.get("South Asia", 0) + 0.5
        elif gray_r > 0.40:
            climate_zone = "Urban / Overcast"
            cues.append("High proportion of gray — urban environment or overcast sky")
        else:
            mean_s = float(img_hsv[:, :, 1].mean())
            if mean_s > 100:
                climate_zone = "Tropical"
                cues.append("High colour saturation — tropical or subtropical climate")
            elif mean_s > 50:
                climate_zone = "Temperate"
                cues.append("Moderate colour saturation — temperate climate")
            else:
                climate_zone = "Arid / Low-light"
                cues.append("Low colour saturation — arid terrain or low-light conditions")

        return climate_zone, cues, votes

    # ── Sky → time of day ─────────────────────────────────────────────────────

    def _analyze_sky(
        self, img_bgr: np.ndarray, img_hsv: np.ndarray, h: int, w: int
    ) -> Tuple[str, List[str]]:
        sky_hsv   = img_hsv[:h // 4, :, :]
        sky_total = max((h // 4) * w, 1)
        cues: List[str] = []

        blue_px   = cv2.countNonZero(
            cv2.inRange(sky_hsv, np.array([90, 60, 60]), np.array([130, 255, 255])))
        sunset_px = cv2.countNonZero(
            cv2.inRange(sky_hsv, np.array([5, 60, 100]),  np.array([25, 255, 255])))
        dark_px   = cv2.countNonZero(
            cv2.inRange(sky_hsv, np.array([0, 0, 0]),    np.array([179, 255, 50])))

        blue_r   = blue_px   / sky_total
        sunset_r = sunset_px / sky_total
        dark_r   = dark_px   / sky_total

        if dark_r > 0.70:
            cues.append("Dark sky region — night-time or indoor image")
            return "Night", cues
        if sunset_r > 0.15:
            cues.append("Golden/orange sky — sunrise or sunset lighting")
            return "Sunrise / Sunset", cues
        if blue_r > 0.25:
            sky_v = float(img_bgr[:h // 4, :, :].mean())
            if sky_v > 180:
                cues.append("Bright blue sky — midday lighting")
                return "Midday", cues
            cues.append("Blue sky with moderate brightness — morning or afternoon")
            return "Morning / Afternoon", cues
        cues.append("Overcast or obscured sky")
        return "Overcast / Unknown", cues

    # ── Architecture ──────────────────────────────────────────────────────────

    def _analyze_architecture(
        self, img_bgr: np.ndarray, h: int, w: int
    ) -> Tuple[List[str], Dict[str, float]]:
        cues: List[str] = []
        votes: Dict[str, float] = {}
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        # Edge density in lower half
        lower_edges = cv2.Canny(gray[h // 2:, :], 50, 150)
        edge_density = float(lower_edges.sum()) / (255 * max(lower_edges.size, 1))
        if edge_density > 0.12:
            cues.append("Dense architectural structures — complex building facades")
            votes["Western Europe"] = votes.get("Western Europe", 0) + 0.5
            votes["East Asia"]      = votes.get("East Asia", 0) + 0.5

        # Dome / rounded structure detection in upper half
        upper = gray[:h // 2, :]
        _, binary = cv2.threshold(upper, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        dome_count = sum(
            1 for cnt in contours
            if cv2.contourArea(cnt) > 500 and
            (lambda p: (4 * np.pi * cv2.contourArea(cnt) / p ** 2) > 0.5)(
                max(cv2.arcLength(cnt, True), 1e-6))
        )
        if dome_count >= 2:
            cues.append("Dome or rounded architectural structures detected")
            votes["Middle East / North Africa"] = votes.get("Middle East / North Africa", 0) + 1.0
            votes["South Asia"]                 = votes.get("South Asia", 0) + 0.5

        # Horizontal Hough lines in lower third → flat roofline
        lower_third = gray[2 * h // 3:, :]
        edges_lt    = cv2.Canny(lower_third, 30, 100)
        lines       = cv2.HoughLinesP(edges_lt, 1, np.pi / 180, 30,
                                       minLineLength=w // 8, maxLineGap=20)
        if lines is not None:
            horiz = sum(
                1 for ln in lines
                if abs(np.degrees(np.arctan2(ln[0][3] - ln[0][1],
                                             ln[0][2] - ln[0][0]))) < 15
            )
            if horiz > 10:
                cues.append("Flat horizontal rooflines — modern or Middle Eastern architecture")
                votes["Middle East / North Africa"] = votes.get("Middle East / North Africa", 0) + 0.5

        return cues, votes

    # ── Road markings ─────────────────────────────────────────────────────────

    def _analyze_roads(
        self, img_bgr: np.ndarray, img_hsv: np.ndarray, h: int, w: int
    ) -> Tuple[List[str], Dict[str, float]]:
        cues: List[str] = []
        votes: Dict[str, float] = {}
        bottom_hsv = img_hsv[3 * h // 4:, :]
        bottom_bgr = img_bgr[3 * h // 4:, :]
        rh = bottom_hsv.shape[0]
        area = max(rh * w, 1)

        white_r  = cv2.countNonZero(
            cv2.inRange(bottom_hsv, np.array([0, 0, 180]),   np.array([179, 50, 255]))) / area
        yellow_r = cv2.countNonZero(
            cv2.inRange(bottom_hsv, np.array([15, 100, 100]), np.array([35, 255, 255]))) / area

        if yellow_r > 0.02:
            cues.append("Yellow road markings — North American road standard")
            votes["North America"] = votes.get("North America", 0) + 1.5
        elif white_r > 0.05:
            cues.append("White road markings — European or Asian road standard")
            votes["Western Europe"] = votes.get("Western Europe", 0) + 0.5
            votes["East Asia"]      = votes.get("East Asia", 0) + 0.3

        mean_v = float(cv2.cvtColor(bottom_bgr, cv2.COLOR_BGR2GRAY).mean())
        if mean_v > 160:
            cues.append("Light-coloured road surface — concrete or desert-region road")
            votes["Middle East / North Africa"] = votes.get("Middle East / North Africa", 0) + 0.4

        return cues, votes

    # ── Signage / text-blob script detection ─────────────────────────────────

    def _detect_signage(
        self, img_bgr: np.ndarray
    ) -> Tuple[List[str], Dict[str, float]]:
        cues: List[str] = []
        votes: Dict[str, float] = {}
        gray    = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        thresh  = cv2.adaptiveThreshold(blurred, 255,
                                         cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                         cv2.THRESH_BINARY_INV, 11, 2)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        aspect_ratios: List[float] = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 20 or area > 5000:
                continue
            _, _, bw, bh = cv2.boundingRect(cnt)
            if bh == 0:
                continue
            ar = bw / bh
            if 0.1 < ar < 15:
                aspect_ratios.append(ar)

        if len(aspect_ratios) < 20:
            return cues, votes   # too few blobs to infer script

        ar_arr = np.array(aspect_ratios)
        square_r    = float((ar_arr < 1.3).mean())
        elongated_r = float((ar_arr > 2.5).mean())
        latin_r     = float(((ar_arr >= 1.0) & (ar_arr <= 2.5)).mean())

        if square_r > 0.50:
            cues.append("Square text blobs detected — CJK script (East/Southeast Asian origin)")
            votes["East Asia"]      = votes.get("East Asia", 0) + 2.0
            votes["Southeast Asia"] = votes.get("Southeast Asia", 0) + 1.0
        elif elongated_r > 0.30:
            cues.append("Horizontally elongated text blobs — Arabic, Devanagari, or connected-script signage")
            votes["Middle East / North Africa"] = votes.get("Middle East / North Africa", 0) + 1.5
            votes["South Asia"]                 = votes.get("South Asia", 0) + 1.0
        elif latin_r > 0.50 and len(aspect_ratios) > 50:
            cues.append("Text regions consistent with Latin-script signage")
            votes["Western Europe"] = votes.get("Western Europe", 0) + 0.5
            votes["North America"]  = votes.get("North America", 0) + 0.5

        return cues, votes

    # ── 2. Time-period estimation ─────────────────────────────────────────────

    def estimate_time_period(self, image_path: str) -> Dict[str, Any]:
        """
        Estimate the decade the image originates from using visual quality markers.

        Returns
        -------
        {"estimated_decade": str, "confidence": float, "indicators": list[str]}
        """
        if not Path(image_path).exists():
            return {"estimated_decade": "Unknown", "confidence": 0.0, "indicators": []}
        if not _CV2:
            return {"estimated_decade": "2020s–Present", "confidence": 0.2,
                    "indicators": ["OpenCV unavailable — time-period analysis skipped"]}

        img_bgr = cv2.imread(image_path)
        if img_bgr is None:
            return {"estimated_decade": "Unknown", "confidence": 0.0, "indicators": []}

        gray    = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        img_hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
        h, w    = gray.shape
        indicators: List[str] = []
        year_votes: Dict[int, float] = {}

        # 1. Colour saturation
        mean_sat = float(img_hsv[:, :, 1].mean())
        if mean_sat < 30:
            indicators.append("Very low saturation — black-and-white or very old photograph")
            year_votes[1960] = year_votes.get(1960, 0) + 2.0
        elif mean_sat < 60:
            indicators.append("Low saturation — 1970s–1990s film era")
            year_votes[1995] = year_votes.get(1995, 0) + 1.5
        else:
            indicators.append("Full colour saturation — modern digital photograph")
            year_votes[9999] = year_votes.get(9999, 0) + 1.5

        # 2. JPEG blockiness (8×8 block artefacts from heavy compression)
        bh = h - h % 8
        bw = w - w % 8
        blocks   = gray[:bh, :bw].astype(float)
        b_means  = blocks.reshape(bh // 8, 8, bw // 8, 8).mean(axis=(1, 3))
        expected = np.repeat(np.repeat(b_means, 8, axis=0), 8, axis=1)
        blockiness = float(np.mean(np.abs(blocks - expected)))

        if blockiness > 10:
            indicators.append(
                f"High JPEG blockiness ({blockiness:.1f}) — heavy compression typical of pre-2005 devices")
            year_votes[2005] = year_votes.get(2005, 0) + 1.0
        elif blockiness < 3:
            indicators.append("Minimal JPEG artefacts — high-quality modern sensor")
            year_votes[9999] = year_votes.get(9999, 0) + 1.0

        # 3. Sharpness (Laplacian variance)
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        if lap_var < 50:
            indicators.append("Low sharpness — film grain or older lens")
            year_votes[1995] = year_votes.get(1995, 0) + 0.5
        elif lap_var > 500:
            indicators.append("High sharpness — modern high-resolution camera")
            year_votes[9999] = year_votes.get(9999, 0) + 1.0

        # 4. Noise level
        blur  = cv2.GaussianBlur(gray, (5, 5), 0)
        noise = float(np.std(gray.astype(float) - blur.astype(float)))
        if noise > 15:
            indicators.append(f"High sensor noise ({noise:.1f}) — film or early digital sensor")
            year_votes[2005] = year_votes.get(2005, 0) + 0.8

        # Resolve decade
        if year_votes:
            best_year = max(year_votes, key=year_votes.get)
            total     = sum(year_votes.values())
            conf      = round(float(np.clip(year_votes[best_year] / max(total, 1e-9), 0.0, 1.0)), 3)
            decade    = next(label for thresh, label in _DECADE_MAP if best_year <= thresh)
        else:
            decade = "2020s–Present"
            conf   = 0.2

        return {"estimated_decade": decade, "confidence": conf, "indicators": indicators}

    # ── 3. Cross-check against claimed location / date ────────────────────────

    def cross_check_with_claim(
        self,
        geolocation_result: Dict[str, Any],
        user_claimed_location: str,
        user_claimed_date: str,
    ) -> Dict[str, Any]:
        """
        Compare estimated region and date against user-supplied claims.

        Returns
        -------
        {
            "location_mismatch":           bool,
            "date_mismatch":               bool,
            "mismatch_details":            list[str],
            "geolocation_suspicion_score": float,
        }
        """
        mismatches: List[str] = []
        location_mismatch     = False
        date_mismatch         = False

        # ── Location ─────────────────────────────────────────────────────────
        likely_region = geolocation_result.get("likely_region", "Unknown")
        conf          = float(geolocation_result.get("confidence", 0.0))

        if likely_region != "Unknown" and conf >= 0.20 and user_claimed_location:
            claimed_lower    = user_claimed_location.lower().strip()
            detected_keywords = _REGION_KEYWORDS.get(likely_region, [])
            claim_fits        = any(kw in claimed_lower for kw in detected_keywords)

            if not claim_fits:
                for region, kws in _REGION_KEYWORDS.items():
                    if region == likely_region:
                        continue
                    if any(kw in claimed_lower for kw in kws):
                        location_mismatch = True
                        mismatches.append(
                            f"Geographic mismatch: visual analysis suggests '{likely_region}' "
                            f"(confidence {conf:.0%}) but claimed location "
                            f"'{user_claimed_location}' matches '{region}'."
                        )
                        break

        # ── Date ─────────────────────────────────────────────────────────────
        time_period    = geolocation_result.get("time_period") or {}
        est_decade     = time_period.get("estimated_decade", "")

        if user_claimed_date and est_decade and est_decade not in ("Unknown", ""):
            m = re.search(r'\b(19|20)\d{2}\b', user_claimed_date)
            if m:
                claimed_year = int(m.group())
                years_in_label = [int(y) for y in re.findall(r'\d{4}', est_decade)]
                if years_in_label:
                    mid_year = int(np.mean(years_in_label))
                    if abs(claimed_year - mid_year) > 20:
                        date_mismatch = True
                        mismatches.append(
                            f"Temporal mismatch: visual quality suggests image is from "
                            f"'{est_decade}' but claimed date '{user_claimed_date}' "
                            f"indicates year {claimed_year}."
                        )

        # Suspicion score
        suspicion = 0.0
        if location_mismatch:
            suspicion += 0.60 * conf
        if date_mismatch:
            suspicion += 0.35
        suspicion = round(float(np.clip(suspicion, 0.0, 1.0)), 4)

        return {
            "location_mismatch":            location_mismatch,
            "date_mismatch":                date_mismatch,
            "mismatch_details":             mismatches,
            "geolocation_suspicion_score":  suspicion,
        }


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════

def _add_votes(dst: Dict[str, float], src: Dict[str, float]) -> None:
    for k, v in src.items():
        dst[k] = dst.get(k, 0.0) + v


def _geo_error(msg: str) -> Dict[str, Any]:
    return {
        "likely_region": "Unknown", "confidence": 0.0,
        "visual_cues_detected": [], "estimated_time_of_day": "Unknown",
        "climate_zone": "Unknown", "region_scores": {}, "error": msg,
    }


def _geo_unavailable(msg: str = "OpenCV not available.") -> Dict[str, Any]:
    return {
        "likely_region": "Unknown", "confidence": 0.0,
        "visual_cues_detected": [f"Analysis unavailable: {msg}"],
        "estimated_time_of_day": "Unknown",
        "climate_zone": "Unknown", "region_scores": {},
    }


# ── Module-level singleton ────────────────────────────────────────────────────

_service = GeoLensService()


def analyze_geolocation(
    file_path: str,
    claimed_location: Optional[str] = None,
    claimed_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Entry point called by routers/geolens.py."""
    geo   = _service.analyze_geolocation(file_path)
    tp    = _service.estimate_time_period(file_path)
    geo["time_period"] = tp

    if claimed_location or claimed_date:
        check = _service.cross_check_with_claim(
            geo,
            claimed_location or "",
            claimed_date     or "",
        )
        geo["claim_check"] = check

    return geo
