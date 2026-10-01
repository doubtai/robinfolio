import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {extname,join,normalize} from 'node:path';
const root=join(process.cwd(),'public'),types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
createServer(async(request,response)=>{try{let pathname=new URL(request.url,'http://localhost').pathname;if(pathname==='/')pathname='/index.html';if(pathname==='/app')pathname='/app.html';const file=normalize(join(root,pathname));if(!file.startsWith(root))throw new Error('invalid path');const info=await stat(file);if(!info.isFile())throw new Error('not found');response.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});response.end(await readFile(file));}catch{response.writeHead(404);response.end('Not found')}}).listen(4177,'127.0.0.1',()=>console.log('Robinfolio preview: http://127.0.0.1:4177'));

