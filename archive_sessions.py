"""Local ZIP jobs: bounded transport parts, unbounded item count, expiring downloads."""
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import secrets
import shutil
import tempfile
import threading
import time
import warnings
import zipfile
from dataclasses import dataclass,field
from fastapi import APIRouter,HTTPException,Request
from fastapi.responses import FileResponse,Response
from PIL import Image
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartParser,MultiPartException
from anyio import CancelScope

MAX_PART_BYTES=96*1024*1024
MAX_PART_FILES=400
DISK_RESERVE=1024*1024*1024
MARKER='local-ad-studio/archive-job/v1'

@dataclass
class ArchiveJob:
    token:str
    folder:Path
    expected:int
    updated:float
    next_seq:int=0
    count:int=0
    state:str='open'
    parts:dict=field(default_factory=dict)
    seen:set=field(default_factory=set)
    leases:int=0
    uploads:int=0
    lock:object=field(default_factory=threading.RLock)
    @property
    def path(self):return self.folder/'result.zip'

class ArchiveManager:
    def __init__(self,root,ttl=1200,start_reaper=True):
        self.root=Path(root);self.root.mkdir(parents=True,exist_ok=True);self.ttl=ttl;self.jobs={};self.registry_lock=threading.Lock();self.write_lock=threading.Lock();self.stopped=threading.Event();self.thread=None
        self._clean_orphans()
        if start_reaper:
            self.thread=threading.Thread(target=self._reap,daemon=True);self.thread.start()
    def _clean_orphans(self):
        for folder in self.root.glob('archive-job-*'):
            try:
                if folder.is_symlink() or not folder.is_dir():continue
                marker=json.loads((folder/'.owner').read_text())
                if not isinstance(marker,dict) or marker.get('signature')!=MARKER or type(marker.get('pid')) is not int or not 0<marker['pid']<=2147483647:continue
                try:os.kill(marker['pid'],0)
                except ProcessLookupError:shutil.rmtree(folder)
            except (OSError,ValueError,OverflowError):continue
    def _reap(self):
        while not self.stopped.wait(30):self.cleanup()
    def create(self,expected):
        if type(expected) is not int or expected<1 or expected>9007199254740991:raise HTTPException(400,'导出文件总数无效')
        with self.write_lock:
            if shutil.disk_usage(self.root).free<DISK_RESERVE+MAX_PART_BYTES:raise HTTPException(507,'本机临时磁盘空间不足，请释放空间')
            folder=Path(tempfile.mkdtemp(prefix='archive-job-',dir=self.root))
            try:(folder/'.owner').write_text(json.dumps({'signature':MARKER,'pid':os.getpid()}))
            except Exception:
                shutil.rmtree(folder);raise HTTPException(507,'无法创建临时导出任务，请检查磁盘空间')
            job=ArchiveJob(secrets.token_urlsafe(32),folder,expected,time.monotonic())
            with self.registry_lock:self.jobs[job.token]=job
            return job
    def lookup(self,token):
        if not re.fullmatch(r'[A-Za-z0-9_-]{43}',token):raise HTTPException(404,'导出任务不存在或已过期')
        with self.registry_lock:job=self.jobs.get(token)
        if job is None or job.state in ('deleted','cancelled'):raise HTTPException(404,'导出任务不存在或已过期')
        return job
    def _delete(self,job):
        job.state='deleted'
        try:shutil.rmtree(job.folder)
        except FileNotFoundError:pass
        except OSError:
            logging.getLogger(__name__).warning('Temporary archive cleanup deferred');return
        with self.registry_lock:self.jobs.pop(job.token,None)
    def begin_upload(self,token):
        job=self.lookup(token)
        with job.lock:
            if job.state!='open':raise HTTPException(409,'导出任务已结束')
            job.uploads+=1;job.updated=time.monotonic()
        return job
    def end_upload(self,job):
        with job.lock:
            job.uploads-=1;job.updated=time.monotonic()
            if job.state in ('cancelled','deleted') and not job.uploads and not job.leases:self._delete(job)
    def _validate_part(self,form):
        files=list(form.multi_items())
        if not files or len(files)>MAX_PART_FILES:raise HTTPException(400,'导出分片为空或文件过多')
        digest=hashlib.sha256();digest.update(len(files).to_bytes(8,'big'));items=[];seen=set();total=0
        for field_name,file in files:
            if field_name!='files' or not isinstance(file,UploadFile):raise HTTPException(400,'导出分片无效')
            name=file.filename
            if not name or not re.fullmatch(r'(?:[\w-]{1,80}/)?[\w-]{1,80}\.png',name) or name in seen:raise HTTPException(400,'导出文件名无效或重复')
            seen.add(name)
            try:
                file.file.seek(0)
                with warnings.catch_warnings():
                    warnings.simplefilter('error',Image.DecompressionBombWarning)
                    image=Image.open(file.file)
                    if image.format!='PNG' or image.width*image.height>24_000_000:raise ValueError()
                    image.verify()
                file.file.seek(0);content=hashlib.sha256();size=0
                for chunk in iter(lambda:file.file.read(65536),b''):size+=len(chunk);content.update(chunk)
                total+=size
                if total>MAX_PART_BYTES:raise HTTPException(413,'单个导出分片过大')
                encoded=name.encode('utf8');digest.update(len(encoded).to_bytes(4,'big'));digest.update(encoded);digest.update(size.to_bytes(8,'big'));digest.update(content.digest());file.file.seek(0);items.append((name,file))
            except (OSError,ValueError,Image.DecompressionBombError,Image.DecompressionBombWarning):raise HTTPException(400,'导出PNG无效或像素超限')
        return items,digest.hexdigest(),total
    def append(self,job,seq,form):
        with self.write_lock,job.lock:
            if job.state!='open':raise HTTPException(409,'导出任务已结束')
            items,digest,total=self._validate_part(form)
            if seq<job.next_seq:
                previous=job.parts.get(seq)
                if previous and previous['digest']==digest:return previous['receipt']
                raise HTTPException(409,'重传分片内容与已接收内容不同')
            if seq!=job.next_seq:raise HTTPException(409,'导出分片顺序不正确')
            if any(name in job.seen for name,_ in items):raise HTTPException(400,'跨分片文件名重复')
            if job.count+len(items)>job.expected:raise HTTPException(400,'成品数量超过导出计划')
            if shutil.disk_usage(job.folder).free<DISK_RESERVE+total+len(items)*1024:raise HTTPException(507,'临时磁盘空间不足，请释放空间后重试')
            try:
                with zipfile.ZipFile(job.path,'a',compression=zipfile.ZIP_STORED,allowZip64=True) as archive:
                    for name,file in items:
                        with archive.open(name,'w',force_zip64=True) as entry:shutil.copyfileobj(file.file,entry,65536)
            except Exception:
                self._delete(job);raise HTTPException(500,'ZIP写入失败，任务已作废，请重新导出')
            job.seen.update(name for name,_ in items);job.count+=len(items);job.next_seq+=1;job.updated=time.monotonic();receipt={'nextSeq':job.next_seq,'files':job.count};job.parts[seq]={'digest':digest,'receipt':receipt};return receipt
    def finish(self,job):
        with job.lock:
            if job.state=='sealed':
                job.updated=time.monotonic();return {'downloadUrl':f'/api/archives/{job.token}/download','files':job.count}
            if job.state!='open' or job.count!=job.expected:raise HTTPException(409,'导出尚未完整完成或任务已取消')
            job.state='sealed';job.updated=time.monotonic();return {'downloadUrl':f'/api/archives/{job.token}/download','files':job.count}
    def reserve_download(self,token):
        job=self.lookup(token)
        with job.lock:
            if job.state!='sealed':raise HTTPException(409,'导出尚未完成')
            job.leases+=1;job.updated=time.monotonic();return job
    def release_download(self,job):
        with job.lock:
            job.leases-=1;job.updated=time.monotonic()
            if job.state in ('cancelled','deleted') and not job.leases and not job.uploads:self._delete(job)
    def cancel(self,token):
        try:job=self.lookup(token)
        except HTTPException:return
        with job.lock:
            job.state='cancelled'
            if not job.leases and not job.uploads:self._delete(job)
    def cleanup(self):
        with self.registry_lock:jobs=list(self.jobs.values())
        for job in jobs:
            with job.lock:
                if job.state in ('deleted','cancelled') and not job.uploads and not job.leases:self._delete(job)
                elif time.monotonic()-job.updated>self.ttl and not job.uploads:
                    job.state='cancelled'
                    if not job.leases:self._delete(job)
    def close(self):
        self.stopped.set()
        if self.thread:self.thread.join(timeout=2)
        with self.registry_lock:tokens=list(self.jobs)
        for token in tokens:self.cancel(token)

class LeasedArchiveResponse(FileResponse):
    def __init__(self,manager,job):super().__init__(job.path,media_type='application/zip',filename='广告素材.zip');self.manager=manager;self.job=job
    async def __call__(self,scope,receive,send):
        try:await super().__call__(scope,receive,send)
        finally:
            with CancelScope(shield=True):await run_in_threadpool(self.manager.release_download,self.job)

class RedactArchiveTokens(logging.Filter):
    def filter(self,record):
        if isinstance(record.args,tuple) and len(record.args)>=3:
            args=list(record.args)
            if isinstance(args[2],str):args[2]=re.sub(r'(/api/archives/)[A-Za-z0-9_-]{43}',r'\1[task]',args[2]);record.args=tuple(args)
        return True
logging.getLogger('uvicorn.access').addFilter(RedactArchiveTokens())
router=APIRouter(prefix='/api/archives')
@router.post('')
async def create_archive(request:Request):
    body=bytearray()
    async for chunk in request.stream():
        if len(body)+len(chunk)>4096:raise HTTPException(413,'导出计划数据过大')
        body.extend(chunk)
    try:expected=json.loads(body)['expectedFiles']
    except (ValueError,KeyError,TypeError,RecursionError):raise HTTPException(400,'导出计划无效')
    job=await run_in_threadpool(request.app.state.archives.create,expected);return {'token':job.token,'maxPartBytes':MAX_PART_BYTES,'maxPartFiles':MAX_PART_FILES}
@router.post('/{token}/parts/{seq}')
async def append_archive(token:str,seq:int,request:Request):
    manager=request.app.state.archives;job=await run_in_threadpool(manager.begin_upload,token);form=None
    async def limited():
        size=0
        async for chunk in request.stream():
            size+=len(chunk)
            if size>MAX_PART_BYTES:raise MultiPartException('分片超过96 MB，请缩小本次传输')
            yield chunk
    try:
        form=await MultiPartParser(request.headers,limited(),max_files=MAX_PART_FILES,max_fields=0).parse()
        return await run_in_threadpool(manager.append,job,seq,form)
    except MultiPartException as error:raise HTTPException(413 if '96 MB' in str(error) else 400,str(error))
    finally:
        with CancelScope(shield=True):
            try:
                if form is not None:await form.close()
            finally:
                try:
                    if form is not None:
                        for _,file in form.multi_items():
                            if isinstance(file,UploadFile):
                                try:await file.close()
                                except OSError:logging.getLogger(__name__).warning('Temporary upload handle could not close')
                finally:await run_in_threadpool(manager.end_upload,job)
@router.post('/{token}/finish')
async def finish_archive(token:str,request:Request):
    manager=request.app.state.archives;job=await run_in_threadpool(manager.lookup,token);return await run_in_threadpool(manager.finish,job)
@router.api_route('/{token}/download',methods=['GET','HEAD'])
async def download_archive(token:str,request:Request):
    manager=request.app.state.archives;job=await run_in_threadpool(manager.reserve_download,token);return LeasedArchiveResponse(manager,job)
@router.delete('/{token}')
async def cancel_archive(token:str,request:Request):
    await run_in_threadpool(request.app.state.archives.cancel,token);return Response(status_code=204)
