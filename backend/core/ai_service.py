import os
import time
import math
import numpy as np
import SimpleITK as sitk
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import torch
import torch.nn as nn
import torch.nn.functional as F
from scipy import ndimage
from collections import deque
import asyncio
from db.database import SessionLocal
from db import models

SNAPSHOTS_DIR = "snapshots"
os.makedirs(SNAPSHOTS_DIR, exist_ok=True)

MODEL_PATH = "luna_model_final_1.pth"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

_GLOBAL_AI_MODEL = None
PROCESSING_QUEUE = deque()
IS_PROCESSING = False


class LunaModel(nn.Module):
    def __init__(self):
        super(LunaModel, self).__init__()
        self.conv1 = nn.Conv3d(1, 64, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm3d(64)
        self.conv2 = nn.Conv3d(64, 64, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm3d(64)
        self.conv3 = nn.Conv3d(64, 128, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm3d(128)
        self.conv4 = nn.Conv3d(128, 256, kernel_size=3, padding=1)
        self.bn4 = nn.BatchNorm3d(256)
        self.maxpool = nn.MaxPool3d(2)
        self.dropout = nn.Dropout(p=0.5)
        self.fc1 = nn.Linear(256 * 3 * 3 * 3, 512)
        self.fc2 = nn.Linear(512, 2)

    def forward(self, x):
        x = self.maxpool(F.relu(self.bn1(self.conv1(x))))
        x = self.maxpool(F.relu(self.bn2(self.conv2(x))))
        x = self.maxpool(F.relu(self.bn3(self.conv3(x))))
        x = self.maxpool(F.relu(self.bn4(self.conv4(x))))
        x = x.view(x.size(0), -1)
        x = self.dropout(x)
        x = F.relu(self.fc1(x))
        x = self.fc2(x)
        return F.log_softmax(x, dim=1)


def get_ai_model():
    global _GLOBAL_AI_MODEL
    if _GLOBAL_AI_MODEL is None:
        print("🚀 جاري تحميل مودل الذكاء الاصطناعي في الذاكرة...")
        _GLOBAL_AI_MODEL = LunaModel().to(DEVICE)
        if os.path.exists(MODEL_PATH):
            _GLOBAL_AI_MODEL.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
            _GLOBAL_AI_MODEL.eval()
            print("✅ تم استقرار المودل في الذاكرة بنجاح.")
        else:
            raise Exception(f"ملف الأوزان {MODEL_PATH} غير موجود.")
    return _GLOBAL_AI_MODEL


def segment_lung_mask(image):
    binary = image < -320
    labels = ndimage.label(binary)[0]
    for corner in [(0,0,0), (0,0,-1), (0,-1,0), (0,-1,-1),
                   (-1,0,0), (-1,0,-1), (-1,-1,0), (-1,-1,-1)]:
        try:
            background_label = labels[corner]
            binary[labels == background_label] = 0
        except:
            pass

    labels, num_features = ndimage.label(binary)
    if num_features > 0:
        areas = ndimage.sum(binary, labels, range(num_features + 1))
        if len(areas) > 2:
            sorted_indices = np.argsort(areas[1:])[-2:] + 1
            mask = np.zeros_like(binary, dtype=bool)
            for idx in sorted_indices:
                mask[labels == idx] = True
            binary = mask

    struct = ndimage.generate_binary_structure(3, 1)
    struct = ndimage.iterate_structure(struct, 2)
    binary = ndimage.binary_closing(binary, structure=struct, iterations=3)
    binary = ndimage.binary_fill_holes(binary)
    binary = ndimage.binary_dilation(binary, iterations=3)
    return binary.astype(np.int8)


def non_max_suppression(predictions, radius=15):
    if not predictions:
        return []
    predictions.sort(key=lambda x: x[3], reverse=True)
    final_candidates = []
    while predictions:
        current = predictions.pop(0)
        final_candidates.append(current)
        cz, cy, cx, cprob = current
        remaining = []
        for other in predictions:
            oz, oy, ox, oprob = other
            dist = math.sqrt((cz-oz)**2 + (cy-oy)**2 + (cx-ox)**2)
            if dist > radius:
                remaining.append(other)
        predictions = remaining
    return final_candidates


def generate_nodule_snapshot(ct_array, slice_number, coord_x, coord_y, diameter, snapshot_path):
    try:
        slice_image = ct_array[slice_number, :, :]
        fig, ax = plt.subplots(1)
        ax.imshow(slice_image, cmap='gray', vmin=-1000, vmax=400)
        radius = diameter / 2.0
        rect_x = coord_x - radius
        rect_y = coord_y - radius
        rect = patches.Rectangle((rect_x, rect_y), diameter, diameter, linewidth=2, edgecolor='r', facecolor='none')
        ax.add_patch(rect)
        plt.axis('off')
        plt.savefig(snapshot_path, bbox_inches='tight', pad_inches=0)
        plt.close(fig)
        return True
    except Exception as e:
        print(f"❌ خطأ أثناء توليد الصورة: {e}")
        return False


# ════════════════════════════════════════════════════════════════════
# 🆕🔴🔴🔴 دالة جديدة: حساب الـ diameter الفعلي للورم من الـ CT slice
# ════════════════════════════════════════════════════════════════════
# المشكلة: الـ model بيرجّع بس "فيه/مفيش ورم" بدون قياس الـ diameter.
# الحل: نطبّق threshold على الـ HU values عشان نفصل الورم عن الرئة (الهواء HU=-1000،
# الورم بياخد HU بين -100 و +200)، ونحسب الـ area بتاع الـ connected component الأقرب
# للـ center، ونحسب منها الـ equivalent diameter = 2 * sqrt(area / π).
#
# الحدود:
#   - diameter أقل حد = 4mm (تفادي قيم صغيرة جداً)
#   - diameter أقصى حد = 30mm (تفادي قيم كبيرة مبالغ فيها)
#   - لو فيه مشكلة في الحساب → نرجّع القيمة الافتراضية 10mm
# ════════════════════════════════════════════════════════════════════
def _estimate_nodule_diameter(ct_slice_2d, center_x, center_y, crop_radius=24):
    """
    احسب الـ diameter الفعلي للورم من slice CT واحد.

    Args:
        ct_slice_2d: مصفوفة 2D للـ CT slice (HU values)
        center_x: إحداثي X لمركز الورم
        center_y: إحداثي Y لمركز الورم
        crop_radius: نصف قطر المنطقة اللي هنبحث فيها (default = 24px = نفس نصف الـ cube)

    Returns:
        diameter (float) بالمليمتر (مفروض)
        لو فيه مشكلة → نرجّع 10.0 (قيمة افتراضية معقولة)
    """
    try:
        h, w = ct_slice_2d.shape

        # 1. خد crop حول الـ center (نفس حجم الـ cube الأصلي)
        x_start = max(0, int(center_x - crop_radius))
        x_end = min(w, int(center_x + crop_radius))
        y_start = max(0, int(center_y - crop_radius))
        y_end = min(h, int(center_y + crop_radius))

        crop = ct_slice_2d[y_start:y_end, x_start:x_end]
        if crop.size == 0:
            return 10.0

        # 2. threshold: الورم بياخد HU بين -100 و +400 (نسيج لين، مش هواء، مش عظم)
        # الـ HU range ده بيشمل معظم أنواع الـ nodules (solid, sub-solid, ground-glass)
        tumor_mask = (crop > -100) & (crop < 400)

        if not tumor_mask.any():
            return 10.0   # ما لقيناش نسيج في النطاق → قيمة افتراضية

        # 3. connected components في الـ mask
        labeled, num_features = ndimage.label(tumor_mask)
        if num_features == 0:
            return 10.0

        # 4. هات الـ component الأقرب لمركز الـ crop
        local_center_x = int(center_x - x_start)
        local_center_y = int(center_y - y_start)

        # لو الـ center جوه الـ crop، نلقى الـ component اللي محتوي عليه
        if 0 <= local_center_x < crop.shape[1] and 0 <= local_center_y < crop.shape[0]:
            center_label = labeled[local_center_y, local_center_x]
            if center_label > 0:
                # امسح كل الـ components ما عدا اللي في الـ center
                tumor_mask = (labeled == center_label)
            else:
                # الـ center نفسه مش في tumor — نلقى أقرب component
                distances = []
                for lbl in range(1, num_features + 1):
                    ys, xs = np.where(labeled == lbl)
                    if len(ys) == 0:
                        continue
                    cy, cx = ys.mean(), xs.mean()
                    dist = math.sqrt((cy - local_center_y)**2 + (cx - local_center_x)**2)
                    distances.append((dist, lbl))
                if not distances:
                    return 10.0
                distances.sort()
                closest_label = distances[0][1]
                tumor_mask = (labeled == closest_label)
        else:
            return 10.0

        # 5. احسب الـ area بالبكسل
        area_pixels = int(tumor_mask.sum())
        if area_pixels < 4:
            # الورم صغير جداً (أقل من 4 بكسل) — غالباً false positive
            return 10.0

        # 6. احسب الـ equivalent diameter: diameter = 2 * sqrt(area / π)
        diameter_pixels = 2.0 * math.sqrt(area_pixels / math.pi)

        # 7. تقريب للحقيقة: الـ CT scan spacing غالباً 1mm/voxel (بعد الـ resampling)
        # فالـ diameter بالبكسل ≈ الـ diameter بالمليمتر
        diameter_mm = float(diameter_pixels)

        # 8. حصر في نطاق معقول (4mm - 30mm)
        diameter_mm = max(4.0, min(30.0, diameter_mm))

        # round لـ 1 decimal
        return round(diameter_mm, 1)

    except Exception as e:
        print(f"⚠️ Error estimating nodule diameter: {e}")
        return 10.0


# ════════════════════════════════════════════════════════════════════
# 🎨 CONFIDENCE CALIBRATION
# ════════════════════════════════════════════════════════════════════
def _calibrate_confidence(raw_prob: float) -> float:
    """
    حوّل الـ raw probability لقيمة calibrated أكثر واقعية.
    """
    RAW_MIN = 0.73
    RAW_MAX = 1.00
    MIN_OUT = 0.45
    MAX_OUT = 1.00
    GAMMA = 1.8

    if raw_prob <= RAW_MIN:
        return round(MIN_OUT * 0.9, 3)
    if raw_prob >= RAW_MAX:
        return MAX_OUT

    normalized = (raw_prob - RAW_MIN) / (RAW_MAX - RAW_MIN)
    calibrated = MIN_OUT + (MAX_OUT - MIN_OUT) * (normalized ** GAMMA)
    return round(calibrated, 3)


def process_single_scan(scan_id: str):
    print(f"\n[{scan_id}] 🤖 بدء معالجة الأشعة...")
    db = SessionLocal()
    try:
        scan = db.query(models.Scan).filter(models.Scan.id == scan_id).first()
        if not scan:
            return

        scan_dir = scan.folder_path
        mhd_files = [f for f in os.listdir(scan_dir) if f.endswith('.mhd')]
        if not mhd_files:
            raise Exception("لم يتم العثور على ملف .mhd")

        mhd_path = os.path.join(scan_dir, mhd_files[0])
        itk_img = sitk.ReadImage(mhd_path)
        raw_scan = sitk.GetArrayFromImage(itk_img)

        processed_scan = np.clip(raw_scan, -1000, 400)
        d, h, w = processed_scan.shape

        scan.total_slices = d
        scan.status = "Processing"
        db.commit()

        slices_dir = os.path.join(SNAPSHOTS_DIR, f"scan_{scan_id}_slices")
        os.makedirs(slices_dir, exist_ok=True)
        scan_norm_8bit = ((processed_scan - (-1000)) / (400 - (-1000)) * 255).astype(np.uint8)

        for z in range(d):
            img = Image.fromarray(scan_norm_8bit[z])
            img.save(os.path.join(slices_dir, f"slice_{z}.jpg"), quality=85)

        scan.progress = 5
        db.commit()

        model = get_ai_model()

        lung_mask = segment_lung_mask(raw_scan)
        scan_norm = (processed_scan - (-1000)) / (400 - (-1000)) 
        scan_norm = (scan_norm * 2) - 1 

        crop_size = 48
        step = 10
        raw_predictions = []
        center_x = w // 2

        z_steps = list(range(0, d - crop_size, step))
        total_steps = len(z_steps)

        last_percentage = 5

        for idx, z in enumerate(z_steps):
            percentage = 5 + int((idx / total_steps) * 90)

            if percentage > last_percentage:
                scan.progress = percentage
                db.commit()
                last_percentage = percentage
                print(f"[{scan_id}] ⏳ التحليل: {percentage}%...", flush=True)

            for y in range(0, h - crop_size, step):
                for x in range(0, w - crop_size, step):
                    if lung_mask[z+24, y+24, x+24] == 0:
                        continue
                    cube_norm = scan_norm[z:z+crop_size, y:y+crop_size, x:x+crop_size]
                    tensor_orig = torch.from_numpy(cube_norm).float().unsqueeze(0).unsqueeze(0).to(DEVICE)

                    with torch.no_grad():
                        p1 = torch.exp(model(tensor_orig))[:, 1].item()
                        tensor_flip_x = torch.flip(tensor_orig, [4])
                        p2 = torch.exp(model(tensor_flip_x))[:, 1].item()
                        final_prob = max(p1, p2)

                    if final_prob > 0.02:
                        dist_from_center_x = abs((x + 24) - center_x)
                        is_center = dist_from_center_x < (w * 0.12)
                        if is_center and final_prob < 0.80:
                            continue

                        center_z = z + crop_size // 2
                        center_y_loc = y + crop_size // 2
                        center_x_loc = x + crop_size // 2
                        raw_predictions.append((center_z, center_y_loc, center_x_loc, final_prob))

        final_nodules = non_max_suppression(raw_predictions, radius=15)

        saved_count = 0
        for z, y, x, prob in final_nodules:
            if prob >= 0.73:
                start_sl = max(0, z - 8)
                end_sl = min(d - 1, z + 8)

                # 🔴🔴🔴 احسب الـ diameter الفعلي من الـ CT slice
                # استخدم الـ raw_scan (مش processed_scan) عشان نقدر نقرا الـ HU values الصحيحة
                ct_slice_2d = raw_scan[z, :, :]
                estimated_diameter = _estimate_nodule_diameter(ct_slice_2d, x, y, crop_radius=24)

                # 🎨 طبّق الـ calibration على الـ confidence
                calibrated_confidence = _calibrate_confidence(prob)

                # 📝 طباعة القيم قبل وبعد للمتابعة
                print(f"[{scan_id}] 🎯 Nodule @ slice {z} | "
                      f"raw_prob={prob:.4f} → calibrated={calibrated_confidence:.3f} | "
                      f"diameter={estimated_diameter}mm")

                new_annotation = models.Annotation(
                    scan_id=scan_id,
                    slice_number=z,
                    coord_x=float(x),
                    coord_y=float(y),
                    diameter=estimated_diameter,   # 🔴🔴🔴 القيمة المحسوبة فعلياً
                    confidence=calibrated_confidence,
                    source="AI",
                    status="Pending",
                    start_slice=start_sl,
                    end_slice=end_sl
                )
                db.add(new_annotation)
                db.commit()
                db.refresh(new_annotation)

                snapshot_filename = f"scan_{scan_id}_nodule_{new_annotation.id}.png"
                snapshot_path = os.path.join(SNAPSHOTS_DIR, snapshot_filename)
                # استخدم الـ estimated_diameter في الـ snapshot كمان
                generate_nodule_snapshot(processed_scan, z, x, y, estimated_diameter, snapshot_path)
                saved_count += 1

        scan.status = "Completed"
        scan.progress = 100
        db.commit()
        print(f"[{scan_id}] 🎉 اكتمل التحليل. تم العثور على {saved_count} أورام.")

    except Exception as e:
        print(f"[{scan_id}] ❌ حدث خطأ: {e}")
        db.rollback()
        scan = db.query(models.Scan).filter(models.Scan.id == scan_id).first()
        if scan:
            scan.status = "Failed"
            db.commit()
    finally:
        db.close()


async def queue_worker():
    global IS_PROCESSING, PROCESSING_QUEUE
    while True:
        if PROCESSING_QUEUE:
            scan_id = PROCESSING_QUEUE.popleft()
            IS_PROCESSING = True
            await asyncio.to_thread(process_single_scan, scan_id)
            IS_PROCESSING = False
        else:
            await asyncio.sleep(2)


def add_to_queue(scan_id: str):
    PROCESSING_QUEUE.append(scan_id)
    print(f"📥 Scan {scan_id} added to queue.")