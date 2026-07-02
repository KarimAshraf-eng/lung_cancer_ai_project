"""
CT Scan Windowing API

Provides server-side CT windowing (WW/WC) endpoint with LRU caching.
Reads original JPEG snapshots and applies Hounsfield Unit windowing
using PIL's fast point() method (C-level LUT application).
"""

from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import Response
from PIL import Image
from io import BytesIO
import os

router = APIRouter(tags=["CT Windowing"])

# =========================================================================
# Server-side Windowing LRU Cache
# Stores processed JPEG bytes for (scan_id, slice_num, ww, wc, invert)
# =========================================================================
_windowed_cache: dict[str, bytes] = {}
_MAX_WINDOWED_CACHE = 800


def _build_windowing_lut(ww: int, wc: int, invert: bool) -> list[int]:
    """
    Build a 256-entry Look-Up Table for CT windowing.
    Maps pixel value (0-255) -> approximate Hounsfield Unit -> windowed display value.

    HU range assumption: pixel 0 -> -1000 HU, pixel 255 -> +1000 HU
    (Matches the frontend windowing.js and the backend snapshot rendering)
    """
    lower = wc - ww / 2.0
    upper = wc + ww / 2.0
    lut = []
    for i in range(256):
        hu = (i / 255.0) * 2000.0 - 1000.0
        if hu <= lower:
            val = 0
        elif hu >= upper:
            val = 255
        else:
            val = int((hu - lower) / ww * 255.0)
        if invert:
            val = 255 - val
        lut.append(val)
    return lut


@router.get("/windowed-slice")
async def serve_windowed_slice(
    scan_id: str = Query(..., description="Scan UUID"),
    slice_num: int = Query(..., ge=0, description="Slice index"),
    ww: int = Query(2000, ge=1, le=4000, description="Window Width (HU)"),
    wc: int = Query(0, ge=-1024, le=3071, description="Window Center (HU)"),
    invert: bool = Query(False, description="Invert (negative/X-ray mode)"),
):
    """
    Serve a CT slice snapshot with windowing (WW/WC) applied on the server.

    The backend reads the original JPEG snapshot, applies the windowing LUT
    using PIL's point() method (very fast - C-level loop over 256 entries),
    and returns the result as a JPEG with HTTP caching headers.

    Performance:
    - Server cache: ~800 entries, each ~15-30KB JPEG -> ~12-24MB total
    - Browser cache: Cache-Control: public, max-age=86400 (24h)
    - PIL point() method: sub-millisecond for a 512x512 image
    """
    cache_key = f"{scan_id}_{slice_num}_{ww}_{wc}_{int(invert)}"

    # Check server-side cache
    if cache_key in _windowed_cache:
        return Response(
            content=_windowed_cache[cache_key],
            media_type="image/jpeg",
            headers={
                "Cache-Control": "public, max-age=86400",
                "X-Cache": "HIT",
            },
        )

    # Load original snapshot from disk
    snapshot_path = os.path.join(
        "snapshots", f"scan_{scan_id}_slices", f"slice_{slice_num}.jpg"
    )
    if not os.path.exists(snapshot_path):
        raise HTTPException(status_code=404, detail="Slice snapshot not found")

    try:
        img = Image.open(snapshot_path).convert("L")  # Grayscale

        # Apply windowing only if non-default settings
        if ww != 2000 or wc != 0 or invert:
            lut = _build_windowing_lut(ww, wc, invert)
            img = img.point(lut)  # PIL's point() - fast C-level LUT application

        # Encode to JPEG
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=92)
        image_bytes = buf.getvalue()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process slice: {str(e)}")

    # Update server-side cache (evict oldest half when full)
    if len(_windowed_cache) >= _MAX_WINDOWED_CACHE:
        keys_to_remove = list(_windowed_cache.keys())[: _MAX_WINDOWED_CACHE // 2]
        for k in keys_to_remove:
            del _windowed_cache[k]
    _windowed_cache[cache_key] = image_bytes

    return Response(
        content=image_bytes,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Cache": "MISS",
        },
    )