const MAX_INPUT_BYTES=20*1024*1024,MAX_OUTPUT_BYTES=1024*1024;
export async function prepareTokenImage(file){
 if(!file?.size)throw Error('Choose a non-empty image file.');
 if(file.size>MAX_INPUT_BYTES)throw Error('This image is larger than 20 MB. Choose a smaller image.');
 const supported=['image/png','image/jpeg','image/webp'];
 if(file.type?!supported.includes(file.type):!(/\.(png|jpe?g|webp)$/i.test(file.name)))throw Error('Choose a PNG, JPEG or WebP image.');
 let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw Error('This image could not be opened. Export it as PNG, JPEG or WebP and try again.');}
 try{
  if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>64000000)throw Error('Choose an image with at most 64 megapixels.');
  if(file.size<=MAX_OUTPUT_BYTES&&Math.max(bitmap.width,bitmap.height)<=2048)return file;
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw Error('Your browser could not prepare this image. Try another browser.');
  const encode=(type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not optimize this image.')),type,quality));
  for(const edge of [1024,768,512]){
   const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   // Try lossless first, preserving transparency. WebP also preserves alpha.
   const png=await encode('image/png');if(png.size<=MAX_OUTPUT_BYTES)return new File([png],'token-image.png',{type:'image/png'});
   for(const quality of [.92,.82,.7]){const blob=await encode('image/webp',quality);if(blob.size<=MAX_OUTPUT_BYTES)return new File([blob],'token-image.'+(blob.type==='image/webp'?'webp':'png'),{type:blob.type});}
  }
  throw Error('Could not reduce this image enough. Try exporting a smaller PNG or JPEG.');
 }finally{bitmap.close();}
}

