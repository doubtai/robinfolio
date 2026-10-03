import {put,head} from '@vercel/blob';
import {validateUpload} from '../lib/launch-upload.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const allowed=(process.env.LAUNCH_UPLOAD_WALLETS||'').split(',').map(x=>x.trim().toLowerCase()).filter(x=>/^0x[0-9a-f]{40}$/.test(x));
 const enabled=!!(process.env.BLOB_READ_WRITE_TOKEN||(process.env.BLOB_STORE_ID&&process.env.VERCEL_OIDC_TOKEN))&&allowed.length>0;
 if(req.method==='GET')return res.status(200).json({enabled});
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
 if(!enabled)return res.status(503).json({error:'Image hosting is not connected yet. Use a public image URL for now.'});
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'JSON required'});
 let file;try{file=validateUpload(req.body,allowed);}catch(e){return res.status(400).json({error:e.message});}
 try{
  // Stable content-addressed paths make repeated submissions idempotent.
  let existing;try{existing=await head(file.path);}catch(e){if(e.name!=='BlobNotFoundError')throw e;}
  const blob=existing||await put(file.path,file.bytes,{access:'public',contentType:file.contentType,addRandomSuffix:false,allowOverwrite:false,cacheControlMaxAge:31536000});
  return res.status(200).json({url:blob.url});
 }catch{return res.status(502).json({error:'Image hosting is temporarily unavailable. Try again or use an image URL.'});}
}
