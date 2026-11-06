"""Local text pixels, without replacing typefaces or inventing occluded subjects."""
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import numpy as np
from PIL import Image, ImageChops, ImageFilter
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parent


def recognize_text(image):
    if sys.platform != 'darwin' or not shutil.which('swiftc'):
        raise HTTPException(503, '保留文字需要 macOS 本地文字识别和 Xcode 命令行工具；普通抠图仍可使用')
    source = ROOT / 'scripts' / 'recognize-text.swift'
    binary = ROOT / '.local' / 'recognize-text'
    try:
        if not binary.exists() or binary.stat().st_mtime_ns < source.stat().st_mtime_ns:
            binary.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(['swiftc', '-O', str(source), '-o', str(binary)], check=True, capture_output=True, timeout=90)
        data = io.BytesIO(); image.save(data, format='PNG')
        result = subprocess.run([str(binary)], input=data.getvalue(), check=True, capture_output=True, timeout=60)
        return json.loads(result.stdout)
    except (OSError, subprocess.SubprocessError, ValueError):
        raise HTTPException(503, '本地文字识别不可用，原图已保留；请检查 Xcode 命令行工具后重试')


def text_layer(image, boxes):
    import cv2
    if not boxes:
        raise HTTPException(422, '未检测到可提取文字，原图已保留；可取消保留文字后普通抠图')
    pixels = np.asarray(image)
    output = np.zeros_like(pixels)
    for x, y, w, h in boxes:
        pad = max(3, round(h * .14))
        left, top = max(0, int(x) - pad), max(0, int(y) - pad)
        right, bottom = min(image.width, int(np.ceil(x + w)) + pad), min(image.height, int(np.ceil(y + h)) + pad)
        roi = pixels[top:bottom, left:right]
        if min(roi.shape[:2]) < 5:
            raise HTTPException(422, '文字过小，无法可靠提取；原图已保留')
        rgb = roi[:, :, :3].astype(np.float32)
        border = np.concatenate([rgb[:2].reshape(-1, 3), rgb[-2:].reshape(-1, 3), rgb[:, :2].reshape(-1, 3), rgb[:, -2:].reshape(-1, 3)])
        background = np.median(border, axis=0)
        # A varying surrounding background cannot establish a trustworthy text matte.
        if np.percentile(np.max(np.abs(border - background), axis=1), 95) > 12:
            raise HTTPException(422, '文字周围背景复杂，无法可靠分离；原图已保留')
        distance = np.max(np.abs(rgb - background), axis=2)
        ink = (distance > 8).astype(np.uint8)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
        core = labels[max(0, int(np.ceil(y))-top):min(bottom-top, int(np.ceil(y+h))-top), max(0, int(np.ceil(x))-left):min(right-left, int(np.ceil(x+w))-left)]
        core_counts = np.bincount(core.ravel(), minlength=count)
        accepted = np.zeros(count, dtype=np.uint8)
        for label in range(1, count):
            cx, cy, cw, ch, area = stats[label]
            if area < 2: continue
            if core_counts[label] < area * .5:
                raise HTTPException(422, '文字附近存在无法区分的装饰或图案，原图已保留')
            if cx <= 1 or cy <= 1 or cx + cw >= right - left - 1 or cy + ch >= bottom - top - 1:
                raise HTTPException(422, '文字与周围图案相连，无法可靠分离；原图已保留')
            accepted[label] = 1
        clean = accepted[labels]
        occupied = float(clean.mean())
        if occupied < .005 or occupied > .65:
            raise HTTPException(422, '无法可靠区分文字和底色，原图已保留')
        # Nearest opaque stroke colours decontaminate antialiased edges before changing background.
        local_peak = cv2.dilate(distance, np.ones((5, 5), np.uint8))
        alpha = np.clip(distance / np.maximum(local_peak, 1), 0, 1)
        alpha[distance <= 3] = 0
        support = cv2.dilate(clean, np.ones((3, 3), np.uint8))
        alpha *= support
        foreground = background + (rgb - background) / np.maximum(alpha[:, :, None], 1 / 255)
        rgba = np.dstack([np.clip(np.rint(foreground), 0, 255).astype(np.uint8), np.rint(alpha * roi[:, :, 3]).astype(np.uint8)])
        target = output[top:bottom, left:right]
        take = rgba[:, :, 3] > target[:, :, 3]
        target[take] = rgba[take]
    layer = Image.fromarray(output)
    if layer.getchannel('A').getbbox() is None:
        raise HTTPException(422, '未提取到可见文字，原图已保留')
    return layer


def compose_text_cutout(image, mask, text, mode):
    alpha = text.getchannel('A')
    extent = alpha.filter(ImageFilter.MaxFilter(9))
    if mode == 'split':
        import cv2
        ink = (np.asarray(alpha) > 0).astype(np.uint8)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
        subject = np.asarray(mask)
        for label in range(1, count):
            x, y, w, h, _ = stats[label]
            l, t, r, b = max(0, x-4), max(0, y-4), min(image.width, x+w+4), min(image.height, y+h+4)
            glyph = (labels[t:b, l:r] == label).astype(np.uint8)
            ring = (cv2.dilate(glyph, np.ones((9, 9), np.uint8)) > 0) & (ink[t:b, l:r] == 0)
            if ring.any() and np.mean(subject[t:b, l:r][ring] > 96) > .08:
                raise HTTPException(422, '文字覆盖主体或与主体相连，无法无损分层；请关闭文字分层后重试，原图已保留')
    original_alpha = image.getchannel('A')
    base = image.copy()
    if mode == 'split':
        # Text is known to lie off-subject; clear the full footprint, including model halos.
        mask = ImageChops.multiply(mask, ImageChops.invert(extent))
    base.putalpha(ImageChops.multiply(original_alpha, mask))
    if mode == 'split': return base, text
    # Keep original pixels where the model already retained the lettering.
    merged = Image.alpha_composite(base, text)
    solid = np.asarray(mask) == 255
    result = np.asarray(merged).copy(); result[solid] = np.asarray(base)[solid]
    return Image.fromarray(result), None
