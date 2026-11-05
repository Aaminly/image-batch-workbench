import assert from 'node:assert/strict';
import {writeFile,unlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createArchiveUpload} from '../preview/archive-client.js';
const count=65536,zip=await createArchiveUpload(count),empty=new Blob([]);
for(let i=0;i<count;i++)await zip.append(empty,`${i}.png`);
const {downloadUrl}=await zip.finish(),bytes=Buffer.from(await(await fetch(downloadUrl)).arrayBuffer()),file='work/pages/zip64-check.zip';
try{assert(bytes.includes(Buffer.from([0x50,0x4b,0x06,0x06])));await writeFile(file,bytes);const found=Number(execFileSync('python3',['-c','import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(len(z.infolist()))',file],{encoding:'utf8'}));assert.equal(found,count);console.log(`PASS: ${count} entries, ZIP64 end record and independent Python CRC/count.`);}finally{URL.revokeObjectURL(downloadUrl);await unlink(file).catch(()=>{});}
