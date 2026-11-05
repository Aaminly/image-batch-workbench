"""Local-only image operations, temporary exports and persistent local drafts."""
import base64
from contextlib import asynccontextmanager
import hashlib
import io
import os
from pathlib import Path
import re
import threading
import warnings
import zipfile
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.middleware.trustedhost import TrustedHostMiddleware

ROOT = Path(__file__).resolve().parent
MODEL_NAME = 'birefnet-general'
MODEL_FILE = ROOT / '.models' / f'{MODEL_NAME}.onnx'
MODEL_MD5 = '7a35a0141cbbc80de11d9c9a28f52697'
_model_validation = None
MAX_BODY = 120 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 24_000_000
@asynccontextmanager
async def lifespan(app):
    from archive_sessions import ArchiveManager
    from drafts import DraftStore
    app.state.drafts=DraftStore(ROOT/'.local'/'drafts')
    manager=ArchiveManager(ROOT/'work');app.state.archives=manager
    try:yield
    finally:
        from starlette.concurrency import run_in_threadpool
        await run_in_threadpool(manager.close)

app = FastAPI(docs_url=None, redoc_url=None,lifespan=lifespan)
from archive_sessions import router as archive_router
app.include_router(archive_router)
from drafts import router as drafts_router
app.include_router(drafts_router)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost'])
_lock = threading.Lock()
_session = None

@app.middleware('http')
async def local_access(request: Request, call_next):
    origin = request.headers.get('origin')
    if origin and origin != f'{request.url.scheme}://{request.headers.get("host")}':
        return Response('Only same-origin access is allowed', status_code=403)
    # Chrome retries native attachment downloads without the page's fetch metadata.
    native_archive_download = (
        request.method in ('GET', 'HEAD')
        and re.fullmatch(r'/api/archives/[A-Za-z0-9_-]{43}/download', request.url.path)
        and 'origin' not in request.headers
        and request.headers.get('sec-fetch-mode') == 'navigate'
        and request.headers.get('sec-fetch-dest') == 'empty'
    )
    if request.headers.get('sec-fetch-site') == 'cross-site' and not native_archive_download:
        return Response('Cross-site access is not allowed', status_code=403)
    response = await call_next(request)
    response.headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Cache-Control'] = 'no-store'
    return response

async def body(request, limit=MAX_BODY):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > limit:
            raise HTTPException(413, '文件过大，请缩小后重试')
    return bytes(data)

def decode_image(data):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            image = Image.open(io.BytesIO(data))
            if image.format not in ('PNG', 'JPEG'):
                raise ValueError('format')
            if image.width * image.height > 24_000_000:
                raise ValueError('pixels')
            image.load()
            return ImageOps.exif_transpose(image).convert('RGBA')
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(400, '图片无效；仅支持不超过2400万像素的PNG/JPEG')

def model_ready():
    global _model_validation
    try:
        stat = MODEL_FILE.stat()
        key = (str(MODEL_FILE), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns, MODEL_MD5)
        if _model_validation is None or _model_validation[0] != key:
            digest = hashlib.md5()
            with MODEL_FILE.open('rb') as model:
                for chunk in iter(lambda: model.read(65536), b''):
                    digest.update(chunk)
            _model_validation = (key, digest.hexdigest() == MODEL_MD5)
        return _model_validation[1]
    except OSError:
        return False

def cutout(data):
    image = decode_image(data)
    if not model_ready():
        raise HTTPException(503, '本地模型缺失或损坏，请运行 setup.sh 下载校验')
    if not _lock.acquire(blocking=False):
        raise HTTPException(429, '正在处理另一张图片，请稍后重试')
    try:
        global _session
        from rembg.sessions.birefnet_general import BiRefNetSessionGeneral
        import onnxruntime as ort
        class OfflineSession(BiRefNetSessionGeneral):
            @classmethod
            def download_models(cls, *args, **kwargs):
                return str(MODEL_FILE)
        if _session is None:
            options = ort.SessionOptions()
            options.intra_op_num_threads = min(4, os.cpu_count() or 1)
            _session = OfflineSession(MODEL_NAME, options, providers=['CPUExecutionProvider'])
        mask = _session.predict(image)[0]
        extrema = mask.getextrema()
        if extrema[0] == extrema[1]:
            raise HTTPException(422, '未识别出有效主体，请换图或明确选择使用原图')
        # Preserve original RGB pixels and intersect with any existing alpha.
        from PIL import ImageChops
        image.putalpha(ImageChops.multiply(image.getchannel('A'), mask))
        output = io.BytesIO()
        image.save(output, format='PNG')
        return output.getvalue()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, '本地抠图失败，原图已保留；请重试或选择使用原图')
    finally:
        _lock.release()

@app.get('/api/status')
def status():
    return {'model': MODEL_NAME, 'input_resolution':1024, 'ready': model_ready(), 'local': True}

@app.post('/api/cutout')
async def remove_background(request: Request):
    from starlette.concurrency import run_in_threadpool
    result = await run_in_threadpool(cutout, await body(request, 32 * 1024 * 1024))
    return Response(result, media_type='image/png')

def compress_png(data):
    import shutil
    import subprocess
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
        raise HTTPException(400, '仅支持有效PNG图片')
    decode_image(data)
    tool = shutil.which('pngquant')
    if not tool:
        raise HTTPException(503, '本地PNG压缩工具缺失，请安装 pngquant 后重试')
    try:
        # Target high visual quality; pngquant selects the palette per image.
        result = subprocess.run([tool, '--quality=65-90', '--speed', '3', '--output', '-', '-'], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60, env={**os.environ, 'OMP_NUM_THREADS':'2'})
        if result.returncode == 99:
            raise HTTPException(422, '此图片压缩后未达到最低质量要求，未导出文件')
        if result.returncode or not result.stdout.startswith(b'\x89PNG\r\n\x1a\n'):
            raise HTTPException(500, '本地PNG压缩失败，请重试；未导出文件')
        return result.stdout if len(result.stdout) < len(data) else data
    except subprocess.TimeoutExpired:
        raise HTTPException(504, '本地PNG压缩超时，请缩小尺寸后重试')
    except OSError:
        raise HTTPException(503, '无法运行本地PNG压缩工具，请检查 pngquant 安装')

@app.post('/api/compress-png')
async def compress_export(request: Request):
    from starlette.concurrency import run_in_threadpool
    result = await run_in_threadpool(compress_png, await body(request, 96 * 1024 * 1024))
    return Response(result, media_type='image/png')

@app.post('/api/archive')
async def archive(request: Request):
    if request.headers.get('content-type','').startswith('multipart/form-data'):
        from archive_files import archive_files
        return await archive_files(request,ROOT)
    import json
    try:
        payload = json.loads(await body(request))
        items = payload['items']
        if not isinstance(items, list) or not 1 <= len(items) <= 42:
            raise ValueError()
        output = io.BytesIO()
        seen = set()
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED) as z:
            for item in items:
                name = item['name']
                if not isinstance(name, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}\.png', name) or name in seen:
                    raise ValueError()
                seen.add(name)
                data = base64.b64decode(item['data'], validate=True)
                if not data.startswith(b'\x89PNG\r\n\x1a\n'):
                    raise ValueError()
                decode_image(data)
                z.writestr(name, data)
        return Response(output.getvalue(), media_type='application/zip', headers={'Content-Disposition': 'attachment; filename="ads.zip"'})
    except (ValueError, KeyError, TypeError):
        raise HTTPException(400, '导出包数据或文件名无效')

app.mount('/', StaticFiles(directory=ROOT / 'web', html=True), name='web')
