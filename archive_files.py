"""Binary PNG batch archive with bounded upload and temporary-file cleanup."""
import io
from pathlib import Path
import re
import shutil
import tempfile
import warnings
import zipfile
from fastapi import HTTPException, Request
from fastapi.responses import FileResponse
from PIL import Image
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartParser, MultiPartException

MAX_UPLOAD=256*1024*1024

def pack_files(form,root):
    (root/'work').mkdir(exist_ok=True)
    folder=Path(tempfile.mkdtemp(prefix='export-',dir=root/'work'))
    try:
        target=folder/'ads.zip';seen=set()
        with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_STORED) as archive:
            for key,file in form.multi_items():
                if key!='files' or not isinstance(file,UploadFile):raise ValueError('无效导出文件')
                name=file.filename
                if not name or not re.fullmatch(r'(?:[\w-]{1,80}/)?[\w-]{1,80}\.png',name) or name in seen:raise ValueError('文件名无效或重复')
                seen.add(name)
                with warnings.catch_warnings():
                    warnings.simplefilter('error',Image.DecompressionBombWarning)
                    image=Image.open(file.file)
                    if image.format!='PNG' or image.width*image.height>24_000_000:raise ValueError('PNG尺寸无效')
                    image.verify()
                file.file.seek(0)
                with archive.open(name,'w') as entry:shutil.copyfileobj(file.file,entry,65536)
        if not seen:raise ValueError('没有可导出的图片')
        return FileResponse(target,media_type='application/zip',filename='ads.zip',background=BackgroundTask(shutil.rmtree,folder))
    except Exception:
        shutil.rmtree(folder)
        raise

async def archive_files(request:Request,root:Path):
    async def limited_stream():
        count=0
        async for chunk in request.stream():
            count+=len(chunk)
            if count>MAX_UPLOAD:raise MultiPartException('导出包超过256 MB，请按背景分批导出')
            yield chunk
    form=None
    try:
        parser=MultiPartParser(request.headers,limited_stream(),max_files=850,max_fields=0)
        form=await parser.parse()
        return await run_in_threadpool(pack_files,form,root)
    except MultiPartException as error:
        raise HTTPException(413 if '256 MB' in str(error) else 400,str(error))
    except (ValueError,OSError,Image.DecompressionBombError,Image.DecompressionBombWarning):
        raise HTTPException(400,'导出图片、尺寸或文件名无效')
    finally:
        if form is not None:await form.close()
