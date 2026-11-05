import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createArchiveUpload} from '../preview/archive-client.js';
test('browser ZIP keeps Unicode names, byte content and independent CRC validity',async()=>{
 const zip=await createArchiveUpload(2);await zip.append(new Blob(['first']),'300x250-背景一.png');await zip.append(new Blob(['second']),'600x500.png');const result=await zip.finish();const blob=await(await fetch(result.downloadUrl)).blob();const dir=await mkdtemp(path.join(tmpdir(),'preview-zip-'));
 try{const file=path.join(dir,'export.zip');await writeFile(file,new Uint8Array(await blob.arrayBuffer()));const data=JSON.parse(execFileSync('python3',['-c',"import zipfile,json,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(json.dumps({i.filename:z.read(i).decode() for i in z.infolist()}))",file],{encoding:'utf8'}));assert.deepEqual(data,{'300x250-背景一.png':'first','600x500.png':'second'});}finally{await rm(dir,{recursive:true,force:true});URL.revokeObjectURL(result.downloadUrl);}
});
test('browser ZIP rejects incomplete output and cancellation without publishing a download',async()=>{
 const incomplete=await createArchiveUpload(2);await incomplete.append(new Blob(['x']),'one.png');await assert.rejects(incomplete.finish(),/数量/);await incomplete.cancel();
 const controller=new AbortController(),zip=await createArchiveUpload(1,controller.signal);controller.abort();await assert.rejects(zip.append(new Blob(['x']),'one.png'),{name:'AbortError'});await zip.cancel();await zip.cancel();await assert.rejects(zip.finish());
});

test('new browser ZIP releases the old URL and an old abort cannot revoke the new download',async()=>{
 const oldSignal=new AbortController(),first=await createArchiveUpload(1,oldSignal.signal);await first.append(new Blob(['first']),'one.png');const old=await first.finish();const second=await createArchiveUpload(1);await assert.rejects(fetch(old.downloadUrl));await second.append(new Blob(['second']),'two.png');const current=await second.finish();oldSignal.abort();assert((await(await fetch(current.downloadUrl)).blob()).size>0);URL.revokeObjectURL(current.downloadUrl);
});
