/**
 * CT Scan Windowing Utility
 * 
 * Provides medical-grade windowing presets and pixel transformation functions
 * for adjusting the contrast and brightness of CT scan slice images.
 * 
 * Windowing maps Hounsfield Unit (HU) values to displayable grayscale values.
 * - Window Width (WW): Controls the range of HU values visible (contrast)
 * - Window Center (WC): Controls the midpoint of the visible range (brightness)
 */

// ---------------------------------------------------------------------------
// Medical Windowing Presets (standard HU values)
// ---------------------------------------------------------------------------
export const WINDOW_PRESETS = [
    { id: 'default', name: 'Default', ww: 2000, wc: 0, description: 'Original image display (full range)' },
    { id: 'lung', name: 'Lung', ww: 1500, wc: -600, description: 'Lung parenchyma visualization' },
    { id: 'mediastinal', name: 'Mediastinal', ww: 350, wc: 40, description: 'Mediastinal structures & soft tissue' },
    { id: 'bone', name: 'Bone', ww: 1800, wc: 400, description: 'Bone detail enhancement' },
    { id: 'liver', name: 'Liver', ww: 150, wc: 60, description: 'Liver parenchyma window' },
    { id: 'brain', name: 'Brain', ww: 80, wc: 40, description: 'Intracranial structures' },
    { id: 'abdomen', name: 'Abdomen', ww: 350, wc: 40, description: 'Abdominal soft tissue' },
    { id: 'stroke', name: 'Stroke', ww: 40, wc: 40, description: 'Acute stroke detection' },
    { id: 'subdural', name: 'Subdural', ww: 200, wc: 80, description: 'Subdural hemorrhage detection' },
    { id: 'soft_tissue', name: 'Soft Tissue', ww: 400, wc: 50, description: 'General soft tissue' },
];

// Color map for each preset (used in UI)
export const PRESET_COLORS = {
    default: { active: 'bg-slate-500', text: 'text-white' },
    lung: { active: 'bg-sky-500', text: 'text-white' },
    mediastinal: { active: 'bg-amber-500', text: 'text-white' },
    bone: { active: 'bg-gray-300', text: 'text-gray-900' },
    liver: { active: 'bg-emerald-500', text: 'text-white' },
    brain: { active: 'bg-violet-500', text: 'text-white' },
    abdomen: { active: 'bg-orange-500', text: 'text-white' },
    stroke: { active: 'bg-rose-500', text: 'text-white' },
    subdural: { active: 'bg-red-600', text: 'text-white' },
    soft_tissue: { active: 'bg-teal-500', text: 'text-white' },
    custom: { active: 'bg-blue-600', text: 'text-white' },
};

// ---------------------------------------------------------------------------
// Internal: HU range assumed for the backend-rendered snapshots
// The backend generates JPG snapshots from CT data. We assume a linear mapping
// from approximately -1000 HU to +1000 HU across the 0-255 grayscale range.
// ---------------------------------------------------------------------------
const MIN_HU = -1000;
const MAX_HU = 1000;
const HU_RANGE = MAX_HU - MIN_HU; // 2000

/**
 * Convert an 8-bit pixel value (0-255) to an approximate Hounsfield Unit value.
 * @param {number} pixel - 8-bit grayscale pixel value (0-255)
 * @returns {number} Approximate HU value
 */
function pixelToHU(pixel) {
    return (pixel / 255) * HU_RANGE + MIN_HU;
}

/**
 * Apply windowing transformation in HU space.
 * Values below the window are mapped to 0 (black), above to 255 (white),
 * and values within the window are linearly mapped to 0-255.
 * 
 * @param {number} hu - Hounsfield Unit value
 * @param {number} ww - Window Width in HU
 * @param {number} wc - Window Center in HU
 * @returns {number} Display value (0-255)
 */
function applyWindowingHU(hu, ww, wc) {
    const lower = wc - ww / 2;
    const upper = wc + ww / 2;
    if (hu <= lower) return 0;
    if (hu >= upper) return 255;
    return ((hu - lower) / ww) * 255;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a 256-entry Look-Up Table (LUT) for windowing transformation.
 * Using a LUT is much faster than per-pixel calculation during rendering,
 * since the transformation only needs to be computed once for 256 possible
 * input values, and then applied via a simple array lookup for every pixel.
 * 
 * @param {number} ww - Window Width in Hounsfield Units (typical range: 1-4000)
 * @param {number} wc - Window Center in Hounsfield Units (typical range: -1024 to 3071)
 * @param {boolean} invert - Whether to invert the display (negative/X-ray mode)
 * @returns {Uint8Array} 256-entry LUT mapping input pixel values to output
 */
export function buildWindowingLUT(ww, wc, invert = false) {
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        const hu = pixelToHU(i);
        let windowed = applyWindowingHU(hu, ww, wc);
        windowed = Math.max(0, Math.min(255, Math.round(windowed)));
        if (invert) windowed = 255 - windowed;
        lut[i] = windowed;
    }
    return lut;
}

/**
 * Apply a pre-computed LUT to Canvas ImageData.
 * Modifies the pixel data in-place for maximum performance.
 * Processes RGB channels independently while preserving the Alpha channel.
 * 
 * @param {ImageData} imageData - Canvas ImageData object (from getImageData)
 * @param {Uint8Array} lut - Pre-computed 256-entry Look-Up Table
 * @returns {ImageData} The modified ImageData (same reference, modified in-place)
 */
export function applyWindowingToImageData(imageData, lut) {
    const data = imageData.data;
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
        data[i] = lut[data[i]];       // Red channel
        data[i + 1] = lut[data[i + 1]];   // Green channel
        data[i + 2] = lut[data[i + 2]];   // Blue channel
        // Alpha channel (data[i + 3]) is intentionally left unchanged
    }
    return imageData;
}

/**
 * Get a human-readable description for a windowing preset by its ID.
 * @param {string} presetId - Preset identifier
 * @returns {string} Description string
 */
export function getPresetDescription(presetId) {
    const preset = WINDOW_PRESETS.find(p => p.id === presetId);
    return preset ? preset.description : 'Custom windowing settings';
}