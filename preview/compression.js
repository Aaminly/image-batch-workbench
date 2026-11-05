import {pngBlob} from '../web/render.js';
export async function compressedPng(canvas,signal){
 signal?.throwIfAborted();const blob=await pngBlob(canvas);signal?.throwIfAborted();return blob;
}
