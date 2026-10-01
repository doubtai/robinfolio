import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const address='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),pm='0x58daec3116aae6d93017baaea7749052e8a04fa7';
const source=fs.readFileSync('lib/defi-sources.js','utf8').replaceAll('export async function','async function');
const user={address,chain:{id:4663},marketPositions:[{id:'market',market:{loanAsset:{symbol:'USDG'}},state:{supplyShares:994532527218,supplyAssetsUsd:1,borrowShares:'20',borrowAssetsUsd:2,collateral:0,timestamp:123}}],vaultPositions:[{id:'old',vault:{address:other,name:'V1'},state:{shares:0,assetsUsd:0}}],vaultV2Positions:[{id:'vault',shares:'2989084328672150081',assetsUsd:3,vault:{address:other,name:'V2'}}]};
const ctx=vm.createContext({AbortSignal,fetch:async()=>({ok:true,json:async()=>({data:{userByAddress:user}})})});vm.runInContext(source,ctx);const rows=await vm.runInContext(`morphoPositions('${address}')`,ctx);assert.equal(rows.items.length,3);assert.equal(rows.items[0].value,1);assert.equal(rows.items[1].side,'Debt');assert.equal(rows.items[2].value,3);
const word=n=>BigInt(n).toString(16).padStart(64,'0');let count=3,fail=false;
const v4=vm.createContext({URLSearchParams,AbortSignal,Buffer,process:{env:{ETHERSCAN_API_KEY:'secret'}},fetch:async(url,options)=>{
 if(String(url).includes('etherscan'))return {ok:true,json:async()=>({status:'1',result:[1,2,3,4].map(id=>({contractAddress:pm,tokenID:String(id),from:other,to:address}))})};
 const b=JSON.parse(options.body);let result;if(b.method==='eth_blockNumber')result='0x100';else {const data=b.params[0].data,id=Number(BigInt('0x'+data.slice(10)));
 if(data.startsWith('0x70a08231'))result='0x'+word(count);
 else if(data.startsWith('0x6352211e'))result='0x'+(id===2?other:address).slice(2).padStart(64,'0');
 else if(data.startsWith('0x1efeed33')){if(fail)return {ok:true,json:async()=>({error:{code:-32000,message:'timeout'}})};result='0x'+word(id===3?0:99);}
 else if(data.startsWith('0x7ba03aad'))result='0x'+word(0)+word(0)+word(1000)+word(10)+word(0)+word(0);
 else throw Error('unexpected');}
 return {ok:true,json:async()=>({result})};
}});vm.runInContext(fs.readFileSync('lib/uniswap-v4.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export const','const').replace('export async function','async function'),v4);
let d=await vm.runInContext(`uniswapV4Positions('${address}')`,v4);assert.equal(d.items.length,2);assert.equal(d.items[0].tokenId,'1');assert.equal(d.items[1].tokenId,'4');assert.equal(d.partial,true);assert.equal(d.items[0].value,null);count=4;d=await vm.runInContext(`uniswapV4Positions('${address}')`,v4);assert(d.partial);fail=true;d=await vm.runInContext(`uniswapV4Positions('${address}')`,v4);assert(d.partial);assert.equal(d.items.length,0);console.log('PASS Morpho numeric/string shares, zero exclusion, debt; V4 owner verification, closed liquidity, distinct NFTs, missing discovery and RPC failure');

