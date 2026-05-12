"""
News Verifier Service — context cross-checking against live news sources.

Data sources
------------
  NewsAPI  — recent articles (NEWS_API_KEY)
  Bing News Search — Microsoft news index (BING_SEARCH_API_KEY)
  SerpAPI  — Google reverse image search (SERP_API_KEY)

Graceful degradation
--------------------
  • Any missing API key → skip that source, return neutral 0.5 score
  • Any network/HTTP error → caught, logged to flags, neutral score returned
  • All HTTP calls have a 10-second timeout

No external NLP library is required.  Claim extraction uses only regex.
"""

import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

try:
    import cv2
    import numpy as np
    _CV2 = True
except ImportError:
    _CV2 = False

# ── API keys (read from env, never hard-coded) ────────────────────────────────

NEWS_API_KEY       = os.getenv("NEWS_API_KEY",       "")
BING_SEARCH_API_KEY = os.getenv("BING_SEARCH_API_KEY", "")
SERP_API_KEY       = os.getenv("SERP_API_KEY",       "")

_HTTP_TIMEOUT = 10.0  # seconds

# ── Stop-word set for keyword overlap scoring ─────────────────────────────────

_STOP_WORDS = {
    "a","an","the","and","or","but","in","on","at","to","for","of","with",
    "by","from","is","was","are","were","been","be","have","has","had","do",
    "does","did","will","would","could","should","may","might","shall","can",
    "not","no","nor","yet","so","if","then","that","this","these","those",
    "it","its","we","you","he","she","they","them","their","our","your",
    "his","her","who","which","what","when","where","how","why","said","says",
    "after","before","about","also","just","more","than","over","up","down",
    "as","into","through","during","including","until","against","between",
    "without","within","along","following","across","behind","beyond","plus",
    "except","but","up","out","around","down","off","above","near",
}

# ── Month names for date extraction ──────────────────────────────────────────

_MONTH_NAMES = {
    "january","february","march","april","may","june",
    "july","august","september","october","november","december",
    "jan","feb","mar","apr","jun","jul","aug","sep","oct","nov","dec",
}

# ── HSV colour range definitions for image description ───────────────────────

_COLOUR_RANGES = [
    ("red",     np.array([0,  70, 50]),  np.array([10, 255, 255])) if _CV2 else None,
    ("orange",  np.array([11, 70, 50]),  np.array([25, 255, 255])) if _CV2 else None,
    ("yellow",  np.array([26, 70, 50]),  np.array([34, 255, 255])) if _CV2 else None,
    ("green",   np.array([35, 40, 40]),  np.array([85, 255, 255])) if _CV2 else None,
    ("blue",    np.array([86, 60, 50]),  np.array([130,255, 255])) if _CV2 else None,
    ("purple",  np.array([131,50, 50]),  np.array([160,255, 255])) if _CV2 else None,
    ("white",   np.array([0,  0, 200]),  np.array([179, 30, 255])) if _CV2 else None,
    ("brown",   np.array([10, 50, 50]),  np.array([20, 180, 150])) if _CV2 else None,
]
_COLOUR_RANGES = [c for c in _COLOUR_RANGES if c is not None]


# ═════════════════════════════════════════════════════════════════════════════
# NewsVerifier
# ═════════════════════════════════════════════════════════════════════════════

class NewsVerifier:

    # ── 1. Context verification ───────────────────────────────────────────────

    def verify_context(
        self, user_context: str, image_description: str
    ) -> Dict[str, Any]:
        """
        Cross-check the user's claimed context against live news sources.

        Returns
        -------
        {
            "sources_found":        list[dict],
            "context_match_score":  float,        # 0.0–1.0 (higher = better match)
            "mismatches":           list[str],
            "verdict":              str,
            "status":               str,
        }
        """
        if not any([NEWS_API_KEY, BING_SEARCH_API_KEY]):
            return _neutral("api_keys_not_configured")

        if not user_context.strip():
            return _neutral("no_context_provided")

        query   = _build_query(user_context, image_description)
        sources = []
        flags:  List[str] = []

        # NewsAPI
        if NEWS_API_KEY:
            newsapi_results, err = self._search_newsapi(query)
            sources.extend(newsapi_results)
            if err:
                flags.append(f"NewsAPI error: {err}")

        # Bing News
        if BING_SEARCH_API_KEY:
            bing_results, err = self._search_bing(query)
            sources.extend(bing_results)
            if err:
                flags.append(f"Bing error: {err}")

        if not sources:
            return {**_neutral("no_sources_found"), "search_flags": flags}

        # Deduplicate by URL
        seen_urls = set()
        unique_sources = []
        for s in sources:
            if s.get("url") not in seen_urls:
                seen_urls.add(s.get("url"))
                unique_sources.append(s)
        sources = unique_sources[:10]

        context_match_score = self._score_context_match(user_context, sources)
        mismatches          = self._detect_mismatches(user_context, sources)
        verdict             = _score_to_verdict(context_match_score, mismatches)

        return {
            "sources_found":       sources,
            "context_match_score": round(context_match_score, 4),
            "mismatches":          mismatches,
            "verdict":             verdict,
            "status":              "ok",
            "search_flags":        flags,
        }

    # ── 2. Reverse image search ───────────────────────────────────────────────

    def reverse_image_search(self, image_path: str) -> Dict[str, Any]:
        """
        Search for the image using SerpAPI Google Reverse Image Search.

        Note: SerpAPI requires a publicly accessible URL.  For a local file,
        this method returns a helpful message.  When the backend is deployed,
        pass the public URL via image_url instead.

        Returns
        -------
        {
            "sources": list[dict],
            "status":  str,
            "flags":   list[str],
        }
        """
        if not SERP_API_KEY:
            return {
                "sources": [],
                "status":  "api_keys_not_configured",
                "flags":   ["SERP_API_KEY not set in .env"],
            }

        if not Path(image_path).exists():
            return {"sources": [], "status": "file_not_found", "flags": []}

        # SerpAPI needs a hosted URL — local files can't be sent directly
        return {
            "sources": [],
            "status":  "local_file_requires_hosted_url",
            "flags": [
                "SerpAPI reverse image search requires a publicly accessible image URL. "
                "Deploy the backend and pass the hosted image URL to use this feature."
            ],
        }

    def reverse_image_search_by_url(self, image_url: str) -> Dict[str, Any]:
        """Run SerpAPI reverse image search on a hosted image URL."""
        if not SERP_API_KEY:
            return {"sources": [], "status": "api_keys_not_configured", "flags": []}

        try:
            with httpx.Client(timeout=_HTTP_TIMEOUT) as client:
                resp = client.get(
                    "https://serpapi.com/search",
                    params={
                        "engine":    "google_reverse_image",
                        "image_url": image_url,
                        "api_key":   SERP_API_KEY,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            return {"sources": [], "status": "error", "flags": [str(exc)]}

        inline = data.get("inline_images", [])
        pages  = data.get("image_results", [])

        sources = [
            {"title": r.get("title", ""), "url": r.get("link", ""),
             "source": "SerpAPI / Google Reverse Image"}
            for r in (inline + pages)[:10]
        ]

        return {"sources": sources, "status": "ok", "flags": []}

    # ── 3. Image description via OpenCV ──────────────────────────────────────

    def extract_image_description(self, image_path: str) -> str:
        """
        Return a short text description of the image suitable for news search.
        Works entirely offline using OpenCV colour and edge analysis.
        """
        if not _CV2:
            return ""
        if not Path(image_path).exists():
            return ""

        img = cv2.imread(image_path)
        if img is None:
            return ""

        h, w   = img.shape[:2]
        total  = max(h * w, 1)
        hsv    = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        gray   = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        parts: List[str] = []

        # Dominant colours
        dom_colours = [
            name for name, lo, hi in _COLOUR_RANGES
            if cv2.countNonZero(cv2.inRange(hsv, lo, hi)) / total > 0.10
        ]
        if dom_colours:
            parts.append(f"dominant colors: {', '.join(dom_colours[:3])}")

        # Structural complexity (edge density)
        edges    = cv2.Canny(gray, 50, 150)
        edge_r   = float(edges.sum()) / (255 * total)
        if edge_r > 0.12:
            parts.append("complex urban or crowded scene")
        elif edge_r < 0.03:
            parts.append("open or minimal scene")

        # Sky presence (top 25%)
        sky_mask = cv2.inRange(
            hsv[:h // 4, :, :],
            np.array([90, 60, 60]), np.array([130, 255, 255])
        )
        sky_r = float(cv2.countNonZero(sky_mask)) / max((h // 4) * w, 1)
        if sky_r > 0.25:
            parts.append("outdoor scene with sky")

        # Vegetation
        veg_r = float(cv2.countNonZero(
            cv2.inRange(hsv, np.array([35, 40, 40]), np.array([85, 255, 255]))
        )) / total
        if veg_r > 0.20:
            parts.append("vegetation or natural landscape")

        # Night / low-light
        mean_v = float(hsv[:, :, 2].mean())
        if mean_v < 60:
            parts.append("low-light or nighttime scene")

        # Many small contours → crowd proxy
        _, binary = cv2.threshold(gray[h // 2:, :], 0, 255,
                                   cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL,
                                        cv2.CHAIN_APPROX_SIMPLE)
        small = [c for c in contours if 50 < cv2.contourArea(c) < 500]
        if len(small) > 30:
            parts.append("crowd or gathering of people")

        return "; ".join(parts) if parts else "general scene"

    # ══════════════════════════════════════════════════════════════════════════
    # Private: API calls
    # ══════════════════════════════════════════════════════════════════════════

    def _search_newsapi(self, query: str) -> Tuple[List[Dict], Optional[str]]:
        try:
            with httpx.Client(timeout=_HTTP_TIMEOUT) as client:
                resp = client.get(
                    "https://newsapi.org/v2/everything",
                    params={
                        "q":       query,
                        "pageSize": 5,
                        "sortBy":  "relevancy",
                        "apiKey":  NEWS_API_KEY,
                    },
                )
                resp.raise_for_status()
                data     = resp.json()
                articles = [
                    {
                        "title":       a.get("title", ""),
                        "description": a.get("description") or "",
                        "url":         a.get("url", ""),
                        "date":        a.get("publishedAt", ""),
                        "source":      a.get("source", {}).get("name", "NewsAPI"),
                        "provider":    "newsapi",
                    }
                    for a in data.get("articles", [])
                    if a.get("title")
                ]
                return articles, None
        except httpx.TimeoutException:
            return [], "request timed out (10s)"
        except Exception as exc:
            return [], str(exc)[:120]

    def _search_bing(self, query: str) -> Tuple[List[Dict], Optional[str]]:
        try:
            with httpx.Client(timeout=_HTTP_TIMEOUT) as client:
                resp = client.get(
                    "https://api.bing.microsoft.com/v7.0/news/search",
                    headers={"Ocp-Apim-Subscription-Key": BING_SEARCH_API_KEY},
                    params={"q": query, "count": 5, "mkt": "en-US",
                            "freshness": "Month"},
                )
                resp.raise_for_status()
                data     = resp.json()
                articles = [
                    {
                        "title":       a.get("name", ""),
                        "description": a.get("description") or "",
                        "url":         a.get("url", ""),
                        "date":        a.get("datePublished", ""),
                        "source":      a.get("provider", [{}])[0].get("name", "Bing News"),
                        "provider":    "bing",
                    }
                    for a in data.get("value", [])
                    if a.get("name")
                ]
                return articles, None
        except httpx.TimeoutException:
            return [], "request timed out (10s)"
        except Exception as exc:
            return [], str(exc)[:120]

    # ══════════════════════════════════════════════════════════════════════════
    # Private: scoring & mismatch detection
    # ══════════════════════════════════════════════════════════════════════════

    def _score_context_match(
        self, user_context: str, articles: List[Dict]
    ) -> float:
        """
        Average keyword-overlap of top-3 articles against the user context.
        Returns 0.0–1.0.
        """
        if not articles:
            return 0.5

        context_tokens = _tokenise(user_context)
        scores = []
        for article in articles[:5]:
            combined = (article.get("title", "") + " " +
                        article.get("description", ""))
            art_tokens = _tokenise(combined)
            if not context_tokens:
                scores.append(0.5)
                continue
            overlap    = context_tokens & art_tokens
            jaccard    = len(overlap) / max(len(context_tokens | art_tokens), 1)
            recall     = len(overlap) / max(len(context_tokens), 1)
            scores.append((jaccard + recall) / 2)

        if not scores:
            return 0.5

        scores.sort(reverse=True)
        return float(min(sum(scores[:3]) / min(len(scores), 3), 1.0))

    def _detect_mismatches(
        self, user_context: str, articles: List[Dict]
    ) -> List[str]:
        """
        Identify date, location, and entity mismatches between the user's
        claimed context and found news articles.
        """
        mismatches: List[str] = []

        # Extract years from user context
        context_years = set(re.findall(r'\b(19|20)\d{2}\b', user_context))

        # Extract years from articles
        article_text_all = " ".join(
            (a.get("title", "") + " " + a.get("description", ""))
            for a in articles
        )
        article_years = set(re.findall(r'\b(19|20)\d{2}\b', article_text_all))

        if context_years and article_years:
            conflicting = {y for y in context_years if y not in article_years}
            for yr in sorted(conflicting)[:2]:
                mismatches.append(
                    f"Year {yr} mentioned in context was not found in any retrieved "
                    f"news article (articles reference: {', '.join(sorted(article_years)[:3])})."
                )

        # Extract proper-noun phrases from context (2+ capitalised words)
        proper_nouns = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b',
                                   user_context)
        article_lower = article_text_all.lower()
        for phrase in proper_nouns[:5]:
            if phrase.lower() not in article_lower:
                mismatches.append(
                    f"Claimed entity '{phrase}' was not mentioned in any retrieved "
                    "news article."
                )

        # Check if context mentions a month/year but articles are from a very
        # different time period
        context_months = [w for w in user_context.lower().split()
                          if w in _MONTH_NAMES]
        if context_months:
            oldest_date = min(
                (a.get("date", "") for a in articles if a.get("date")),
                default=""
            )
            if oldest_date:
                try:
                    art_year = int(oldest_date[:4])
                    ctx_years_int = [int(y) for y in context_years]
                    if ctx_years_int and abs(art_year - max(ctx_years_int)) > 5:
                        mismatches.append(
                            f"Retrieved articles are from {art_year} but context "
                            f"refers to {max(ctx_years_int)} — significant date gap."
                        )
                except (ValueError, IndexError):
                    pass

        return mismatches[:5]   # cap at 5 mismatches


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════

def _tokenise(text: str) -> set:
    words = set(re.findall(r'\b[a-zA-Z]\w*\b', text.lower()))
    return words - _STOP_WORDS


def _build_query(user_context: str, image_description: str) -> str:
    """Combine context + image description into a compact search query."""
    # Strip URLs from context
    clean = re.sub(r'https?://\S+', '', user_context)
    # Take first 150 chars of context
    query = clean[:150].strip()
    # Append key image description terms (first 60 chars)
    if image_description:
        query += " " + image_description[:60]
    # Remove redundant whitespace
    return re.sub(r'\s+', ' ', query).strip()


def _score_to_verdict(score: float, mismatches: List[str]) -> str:
    if mismatches and score < 0.40:
        return "Context appears to contradict news sources"
    if score >= 0.65:
        return "Context is consistent with news sources"
    if score >= 0.35:
        return "Partial match — some elements consistent with news sources"
    return "Low match — context may be misrepresented or too specific to verify"


def _neutral(status: str) -> Dict[str, Any]:
    return {
        "sources_found":       [],
        "context_match_score": 0.5,
        "mismatches":          [],
        "verdict":             "Could not verify — " + status.replace("_", " "),
        "status":              status,
    }


# ═════════════════════════════════════════════════════════════════════════════
# Legacy function (kept for the existing /intelligence/verify-claims endpoint)
# ═════════════════════════════════════════════════════════════════════════════

def verify_claims(claims: List[str]) -> Dict[str, Any]:
    """
    Original verify_claims() — called by routers/intelligence.py.
    Delegates to NewsVerifier.verify_context() when a NEWS_API_KEY is present.
    """
    if not claims:
        return {"verdicts": [], "overall_risk": 0.0}

    verifier = NewsVerifier()
    combined = ". ".join(claims)
    result   = verifier.verify_context(combined, "")

    verdicts = [
        {
            "claim":   c,
            "verdict": result.get("verdict", "unverified"),
            "source":  result["sources_found"][0].get("url") if result["sources_found"] else None,
            "score":   result.get("context_match_score", 0.5),
        }
        for c in claims
    ]

    return {
        "verdicts":     verdicts,
        "overall_risk": round(1.0 - result.get("context_match_score", 0.5), 4),
        "status":       result.get("status", "ok"),
        "mismatches":   result.get("mismatches", []),
    }


# ── module-level singleton ────────────────────────────────────────────────────

_verifier = NewsVerifier()
