import sys,io,random,tempfile,json,zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from PIL import Image
from starlette.datastructures import UploadFile,FormData
from archive_sessions import ArchiveManager
root=Path(__file__).resolve().parent.parent
image=Image.frombytes('RGBA',(3000,3000),random.Random(123).randbytes(36_000_000));output=io.BytesIO();image.save(output,format='PNG',compress_level=0);data=output.getvalue();assert len(data)>32*1024*1024
with tempfile.TemporaryDirectory(dir=root/'work') as folder:
 manager=ArchiveManager(folder,start_reaper=False);job=manager.create(9)
 try:
  for seq,start in enumerate(range(0,9,2)):
   form=FormData([('files',UploadFile(io.BytesIO(data),filename=f'image-{i}.png',size=len(data))) for i in range(start,min(start+2,9))]);manager.append(job,seq,form)
  manager.finish(job);size=job.path.stat().st_size;assert size>256*1024*1024
  with zipfile.ZipFile(job.path) as z:assert len(z.namelist())==9;assert z.testzip() is None;assert z.getinfo('image-8.png').file_size==len(data)
  report={'single_valid_png_bytes':len(data),'single_over_32MiB':True,'zip_bytes':size,'zip_over_256MiB':True,'files':9,'crc_all_correct':True,'parts':5};(root/'work/archive-scale-evidence.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
 finally:manager.close()
