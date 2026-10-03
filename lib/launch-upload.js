import {createHash} from 'node:crypto';
import {verifyMessage} from 'ethers';
export const MAX_IMAGE_BYTES=1024*1024;
export function imageType(bytes){
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&bytes.toString('ascii',12,16)==='IHDR')return ['image/png','png'];
 if(bytes.length>=12&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return ['image/jpeg','jpg'];
 if(bytes.length>=16&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return ['image/webp','webp'];
 throw Error('Choose a PNG, JPEG or WebP image.');
}
export function uploadMessage(hash,timestamp){return `Robinfolio token image upload\nImage SHA-256: ${hash}\nTimestamp: ${timestamp}\nThis signature only authorizes hosting this image. No transaction or spending.`;}
export function validateUpload(body,allowed,now=Date.now()){
 if(!body||typeof body.image!=='string'||body.image.length>Math.ceil(MAX_IMAGE_BYTES/3)*4||!body.image.length||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.image))throw Error('Choose an image up to 1 MB.');
 const bytes=Buffer.from(body.image,'base64');if(bytes.length>MAX_IMAGE_BYTES)throw Error('Choose an image up to 1 MB.');
 const [contentType,extension]=imageType(bytes),hash=createHash('sha256').update(bytes).digest('hex');
 if(!Number.isSafeInteger(body.timestamp)||Math.abs(now-body.timestamp)>300000)throw Error('Upload approval expired. Try again.');
 const signer=verifyMessage(uploadMessage(hash,body.timestamp),body.signature).toLowerCase();
 if(!allowed.includes(signer))throw Error('Image uploads are not enabled for this wallet. You can still use an image URL.');
 return {bytes,contentType,path:`token-images/${signer}/${hash}.${extension}`};
}
