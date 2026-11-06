"""Persistent local drafts; one process owns writes and revision checks."""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import time
import uuid
import warnings
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from PIL import Image
from starlette.concurrency import run_in_threadpool

MAX_PROJECT=120*1024*1024
MAX_META=11*(MAX_PROJECT+64*1024)

def atomic_bytes(path,data):
    temporary=None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent,delete=False) as out:
            temporary=Path(out.name);out.write(data);out.flush();os.fsync(out.fileno())
        os.replace(temporary,path)
    finally:
        if temporary and temporary.exists():temporary.unlink()

def atomic_json(path,value):atomic_bytes(path,json.dumps(value,ensure_ascii=False,allow_nan=False).encode())

def thumbnail(project,current_id):
    media=project.get('media',{});variants=project['variants']
    for v in sorted(variants,key=lambda v:v['id']!=current_id):
        content=v.get('content',{})
        def asset(key):
            ref=content.get(key) if key in content else project['assets'].get(key)
            if not isinstance(ref,str):return None
            return media.get(ref) if key in content else ref
        source='cutout' if content.get('source',project.get('source'))=='cutout' else 'original'
        ref=asset(source) or asset('logo')
        if ref:return ref
        for e in v['elements'] if isinstance(v.get('elements'),list) else []:
            if isinstance(e,dict) and e.get('type')=='image' and isinstance(e.get('media'),str) and e['media'] in media:return media[e['media']]
    return None

class DraftStore:
    def __init__(self,root):
        self.root=Path(root);self.records=self.root/'records';self.assets=self.root/'assets'
        self.records.mkdir(parents=True,exist_ok=True);self.assets.mkdir(exist_ok=True);self.previews=self.root/'previews';self.previews.mkdir(exist_ok=True);self.lock=threading.RLock()
        self.migrate()
    def path(self,identifier):
        if not isinstance(identifier,str) or not re.fullmatch(r'[0-9a-f]{32}',identifier):raise HTTPException(404,'草稿不存在或已删除')
        return self.records/f'{identifier}.json'
    def get(self,identifier):
        with self.lock:
            try:record=json.loads(self.path(identifier).read_text())
            except FileNotFoundError:raise HTTPException(404,'草稿不存在或已删除')
            except (OSError,ValueError):raise HTTPException(500,'草稿读取失败，未替换当前内容')
            if record.get('deleted'):raise HTTPException(404,'草稿已删除，当前内容仍可导出备份')
            return record
    def write(self,record):
        try:atomic_json(self.path(record['id']),record)
        except (OSError,ValueError):raise HTTPException(507,'草稿保存失败，请检查磁盘空间；上次草稿已保留')
    def create(self,new_batch=False):
        with self.lock:
            if not new_batch:
                active=[json.loads(path.read_text()) for path in self.records.glob('*.json')]
                active=[r for r in active if not r.get('deleted')]
                latest=max([r for r in active if r.get('project')] or active,key=lambda r:r['updated'],default=None)
                if latest:return {'id':latest['id'],'revision':latest['revision']}
            record={'id':uuid.uuid4().hex,'revision':0,'updated':time.time(),'project':None,'ui':{},'uploads':[]}
            self.write(record);return {'id':record['id'],'revision':0}
    def list(self):
        with self.lock:
            rows=[]
            for path in self.records.glob('*.json'):
                try:r=json.loads(path.read_text())
                except (OSError,ValueError):raise HTTPException(500,'草稿目录读取失败，请检查本机数据目录')
                if r.get('deleted') or not r['project']:continue
                p=r['project'];rows.append({'id':r['id'],'revision':r['revision'],'updated':r['updated'],'name':p.get('name') or p.get('copy',{}).get('title') or '未命名草稿','sizes':[v['id'] for v in p['variants']],'thumbnail':thumbnail(p,r.get('ui',{}).get('currentId'))})
            return sorted(rows,key=lambda r:r['updated'],reverse=True)
    def asset(self,identifier,data):
        if len(data)>32*1024*1024:raise HTTPException(413,'草稿素材超过32 MB')
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('error',Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(data)) as image:
                    if image.format not in ('PNG','JPEG') or image.width*image.height>24_000_000:raise ValueError()
                    image.verify()
        except (OSError,ValueError,Image.DecompressionBombError,Image.DecompressionBombWarning):raise HTTPException(400,'草稿素材无效')
        ref=hashlib.sha256(data).hexdigest()
        with self.lock:
            r=self.get(identifier);path=self.assets/ref
            try:
                if not path.exists():atomic_bytes(path,data)
                if ref not in r['uploads']:
                    r['uploads'].append(ref);r.setdefault('pending',[]).append(ref);self.write(r)
            except OSError:raise HTTPException(507,'素材保存失败，请检查磁盘空间')
        return ref
    def read_asset(self,identifier,ref,preview=False):
        with self.lock:
            r=self.get(identifier)
            if not isinstance(ref,str) or ref not in r['uploads']:raise HTTPException(404,'草稿素材不存在')
            try:
                if preview:
                    target=self.previews/ref
                    if not target.exists():
                        with Image.open(self.assets/ref) as image:
                            image.thumbnail((160,160));output=io.BytesIO();image.convert('RGBA').save(output,format='PNG');atomic_bytes(target,output.getvalue())
                    return target.read_bytes()
                return (self.assets/ref).read_bytes()
            except OSError:raise HTTPException(500,'草稿素材读取失败')
    def validate_state(self,r,payload):
        try:
            if len(json.dumps(payload,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode())>MAX_PROJECT+64*1024:raise ValueError()
            p=payload['project'];ui=payload['ui'];variants=p['variants'];backgrounds=p['backgrounds'];assets=p['assets']
            if p['version']!=1 or not isinstance(p.get('name',''),str) or len(p.get('name',''))>100 or not isinstance(variants,list) or not 1<=len(variants)<=40 or not isinstance(backgrounds,list) or not isinstance(ui,dict):raise ValueError()
            ids=set()
            for v in variants:
                w,h=v['width'],v['height']
                if type(w) is not int or type(h) is not int or not 24<=w<=6000 or not 24<=h<=6000 or w*h>16_000_000 or v['id']!=f'{w}x{h}' or v['id'] in ids:raise ValueError()
                ids.add(v['id'])
            if ui.get('currentId') not in ids or not isinstance(ui.get('excludedExportSizes'),list) or any(v not in ids for v in ui['excludedExportSizes']):raise ValueError()
            media=p.get('media',{})
            if not isinstance(media,dict) or any(not isinstance(k,str) or not re.fullmatch(r'm\d+',k) for k in media):raise ValueError()
            if p.get('source','original') not in ('original','cutout'):raise ValueError()
            for v in variants:
                if not isinstance(v.get('elements',[]),list):raise ValueError()
                for e in v.get('elements',[]):
                    if not isinstance(e,dict):raise ValueError()
                    if e.get('type')!='image':continue
                    for key in ('media','originalMedia','cutoutMedia','cutoutResult'):
                        if key=='media' or key in e:
                            if key=='cutoutMedia' and e[key] is None:continue
                            if not isinstance(e.get(key),str) or e[key] not in media:raise ValueError()
                    if e.get('cutoutMedia') and not e.get('originalMedia'):raise ValueError()
                    if e.get('originalMedia') and e['media'] not in (e['originalMedia'],e.get('cutoutMedia')):raise ValueError()
                    if 'cutoutParent' in e or 'cutoutResult' in e:
                        parent=next((item for item in v['elements'] if isinstance(item,dict) and item.get('id')==e.get('cutoutParent')),None)
                        if not isinstance(e.get('cutoutParent'),str) or e['cutoutParent']==e.get('id') or (e['cutoutParent'] not in ('image','logo') and (not parent or parent.get('type')!='image' or 'cutoutParent' in parent)) or e.get('cutoutResult') not in media:raise ValueError()
            for content in [v.get('content',{}) for v in variants]+[p.get('sharedBaseline',{})]:
                if not isinstance(content,dict):raise ValueError()
                if content.get('source','original') not in ('original','cutout'):raise ValueError()
                for key in ('original','cutout','logo','logoOriginal','logoCutout'):
                    if key in content and content[key] is not None and (not isinstance(content[key],str) or content[key] not in media):raise ValueError()
                if 'backgrounds' in content:
                    if not isinstance(content['backgrounds'],list) or any(not isinstance(b,dict) or not isinstance(b.get('data'),str) or b['data'] not in media for b in content['backgrounds']):raise ValueError()
            refs=[assets.get(k) for k in ('original','cutout','logo','logoOriginal','logoCutout') if assets.get(k) is not None]+[b['data'] for b in backgrounds]+list(media.values())
            total=len(json.dumps(p,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode());sizes={}
            for ref in refs:
                if not isinstance(ref,str) or ref not in r['uploads']:raise ValueError()
                if ref not in sizes:
                    path=self.assets/ref
                    with path.open('rb') as image:header=22 if image.read(8).startswith(b'\x89PNG') else 23
                    sizes[ref]=4*((path.stat().st_size+2)//3)+header
                total+=sizes[ref]-len(ref)
            if total>MAX_PROJECT:raise HTTPException(413,'草稿超过120 MB，请减少素材后重试')
        except (KeyError,TypeError,ValueError,OSError,RecursionError):raise HTTPException(400,'缓存内容或素材引用无效')
        return set(refs)
    def collect(self,used):
        used=set(used)
        for path in self.records.glob('*.json'):
            record=json.loads(path.read_text())
            if not record.get('deleted'):used.update(record['uploads'])
        for path in [*self.assets.iterdir(),*self.previews.iterdir()]:
            if re.fullmatch(r'[0-9a-f]{64}',path.name) and path.name not in used:
                try:path.unlink()
                except OSError:pass  # Retry unreferenced file cleanup on the next successful save.
    def migrate(self):
        try:
            records=[json.loads(path.read_text()) for path in self.records.glob('*.json')]
            active=[r for r in records if not r.get('deleted')]
            prepared=[];all_used=set()
            for record in active:
                used=set(record.get('pending',[]))
                if record.get('project'):
                    states=record.get('history',[{'project':record['project'],'ui':record['ui']}])
                    cursor=record.get('cursor',len(states)-1)
                    self.validate_history(record,states,cursor)
                    if states[cursor]!={'project':record['project'],'ui':record['ui']}:raise ValueError()
                    used.update(set().union(*(self.validate_state(record,state) for state in states)))
                    record.update(history=states,cursor=cursor)
                else:used.update(record.get('uploads',[]))
                for ref in used:
                    if not isinstance(ref,str) or not re.fullmatch(r'[0-9a-f]{64}',ref):raise ValueError()
                    raw=(self.assets/ref).read_bytes()
                    if hashlib.sha256(raw).hexdigest()!=ref:raise ValueError()
                    with Image.open(io.BytesIO(raw)) as image:image.verify()
                record.update(uploads=sorted(used));all_used.update(used);prepared.append(record)
            # Validate every batch before writing or collecting any shared asset.
            for record in prepared:self.write(record)
            self.collect(all_used)
        except (OSError,ValueError,KeyError,TypeError):raise HTTPException(500,'缓存迁移失败，未选择更旧的草稿；请保留本机数据目录')
    def validate_history(self,r,states,cursor):
        if not isinstance(states,list) or not 1<=len(states)<=11 or type(cursor) is not int or not 0<=cursor<len(states):raise HTTPException(400,'操作历史无效（最多10步）')
        for state in states:self.validate_state(r,state)
    def save(self,identifier,revision,payload):
        with self.lock:
            r=self.get(identifier)
            token=payload.get('commitId')
            if token is not None and (not isinstance(token,str) or not re.fullmatch(r'[0-9a-f]{32}',token)):raise HTTPException(400,'保存标识无效')
            try:digest=hashlib.sha256(json.dumps({k:payload.get(k) for k in ('project','ui','history','cursor')},sort_keys=True,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode()).hexdigest() if token else None
            except (TypeError,ValueError,RecursionError):raise HTTPException(400,'缓存内容无效')
            if token and token==r.get('commitId'):
                if type(revision) is int and revision==r.get('commitBase') and digest==r.get('commitDigest'):return {'id':identifier,'revision':r['revision'],'updated':r['updated']}
                raise HTTPException(409,'重复保存标识的内容或版本不一致')
            if type(revision) is not int or revision!=r['revision']:raise HTTPException(409,'当前实例已在其他页面更新，请先导出备份，再重新载入缓存')
            states=payload.get('history',[{'project':payload.get('project'),'ui':payload.get('ui')}]);cursor=payload.get('cursor',len(states)-1 if isinstance(states,list) else -1)
            self.validate_history(r,states,cursor)
            if states[cursor]!={'project':payload.get('project'),'ui':payload.get('ui')}:raise HTTPException(400,'当前内容与操作历史不一致')
            used=set().union(*(self.validate_state(r,state) for state in states))
            pending=set(r.get('pending',[]))-used
            r.update(project=states[cursor]['project'],ui=states[cursor]['ui'],history=states,cursor=cursor,uploads=sorted(used|pending),pending=sorted(pending),revision=revision+1,updated=time.time(),commitId=token,commitBase=revision,commitDigest=digest)
            self.write(r);self.collect(used|pending)
            return {'id':identifier,'revision':r['revision'],'updated':r['updated']}
    def delete(self,identifiers):
        if not isinstance(identifiers,list) or not identifiers or len(identifiers)>1000:raise HTTPException(400,'请选择要删除的草稿')
        with self.lock:
            records=[self.get(i) for i in dict.fromkeys(identifiers)]
            for r in records:
                r.update(deleted=True,project=None,ui={},uploads=[],revision=r['revision']+1);self.write(r)
            # Inventories include uploaded-but-uncommitted images, protecting in-flight saves.
            used=set()
            for path in self.records.glob('*.json'):
                record=json.loads(path.read_text());used.update(record['uploads'])
            for path in [*self.assets.iterdir(),*self.previews.iterdir()]:
                if re.fullmatch(r'[0-9a-f]{64}',path.name) and path.name not in used:
                    try:path.unlink()
                    except OSError:pass  # A retained unreferenced blob is safe to collect on the next deletion.

router=APIRouter(prefix='/api/drafts')
async def bounded(request,limit):
    data=bytearray()
    async for chunk in request.stream():
        if len(data)+len(chunk)>limit:raise HTTPException(413,'草稿请求过大')
        data.extend(chunk)
    return bytes(data)
async def json_body(request):
    try:return json.loads(await bounded(request,MAX_META))
    except (ValueError,RecursionError):raise HTTPException(400,'草稿请求无效')
@router.get('')
async def list_drafts(request:Request):return await run_in_threadpool(request.app.state.drafts.list)
@router.post('')
async def create_draft(request:Request,new_batch:bool=False):return await run_in_threadpool(request.app.state.drafts.create,new_batch)
@router.post('/delete')
async def delete_drafts(request:Request):
    data=await json_body(request)
    await run_in_threadpool(request.app.state.drafts.delete,data.get('ids') if isinstance(data,dict) else None)
    return {'deleted':True}
@router.get('/{identifier}')
async def get_draft(identifier:str,request:Request):return await run_in_threadpool(request.app.state.drafts.get,identifier)
@router.put('/{identifier}')
async def save_draft(identifier:str,request:Request):
    data=await json_body(request)
    if not isinstance(data,dict):raise HTTPException(400,'草稿请求无效')
    return await run_in_threadpool(request.app.state.drafts.save,identifier,data.get('revision'),data)
@router.post('/{identifier}/assets')
async def upload_asset(identifier:str,request:Request):
    ref=await run_in_threadpool(request.app.state.drafts.asset,identifier,await bounded(request,32*1024*1024));return {'ref':ref}
@router.get('/{identifier}/assets/{ref}')
async def get_asset(identifier:str,ref:str,request:Request,preview:bool=False):
    data=await run_in_threadpool(request.app.state.drafts.read_asset,identifier,ref,preview)
    return Response(data,media_type='image/png' if data.startswith(b'\x89PNG') else 'image/jpeg')
