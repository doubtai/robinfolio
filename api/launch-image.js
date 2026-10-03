import {put,head,BlobNotFoundError} from '@vercel/blob';
import {validateUpload} from '../lib/launch-upload.js';
let storageCheck={at:0,ready:false};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 // On Vercel the SDK can read OIDC from the request context, not only process.env.
 const enabled=!!(process.env.BLOB_READ_WRITE_TOKEN||process.env.BLOB_STORE_ID);
 if(req.method==='GET'){
  if(enabled&&Date.now()-storageCheck.at>60000){let ready=false;try{await head('token-images/.connection-check');ready=true;}catch(e){ready=e instanceof BlobNotFoundError;}storageCheck={at:Date.now(),ready};}
  return res.status(200).json({enabled:enabled&&storageCheck.ready});
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
 if(!enabled)return res.status(503).json({error:'Image hosting is not connected yet. Use a public image URL for now.'});
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'JSON required'});
 let file;try{file=validateUpload(req.body);}catch(e){return res.status(400).json({error:e.message});}
 try{
  // Stable content-addressed paths make repeated submissions idempotent.
  let existing;try{existing=await head(file.path);}catch(e){if(!(e instanceof BlobNotFoundError))throw e;}
  const blob=existing||await put(file.path,file.bytes,{access:'public',contentType:file.contentType,addRandomSuffix:false,allowOverwrite:false,cacheControlMaxAge:31536000});
  return res.status(200).json({url:blob.url});
 }catch{return res.status(502).json({error:'Image hosting is temporarily unavailable. Try again or use an image URL.'});}
}

