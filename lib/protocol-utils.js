export const CHAIN=4663;
export const valid=v=>/^0x[0-9a-f]{40}$/i.test(String(v));
export const addr=v=>valid(v)?v.toLowerCase():null;
export const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export const positive=v=>{try{return BigInt(v)>0n}catch{return false}};
export async function json(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Source unavailable');const d=await r.json();if(d.errors?.length||d.ready===false)throw Error('Source incomplete');return d;}
const cache=new Map();
export async function cached(key,fn){const old=cache.get(key);if(old&&old.until>Date.now())return old.value;const value=await fn();cache.set(key,{value,until:Date.now()+180000});return value;}
export async function rpc(method,params){const d=await json(process.env.ALCHEMY_ROBINHOOD_RPC_URL||'https://rpc.mainnet.chain.robinhood.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});if(d.error||d.result===undefined)throw Error('Chain read unavailable');return d.result;}
export async function balance(contract,wallet,selector='0x70a08231'){const value=await rpc('eth_call',[{to:contract,data:selector+wallet.slice(2).padStart(64,'0')},'latest']);if(!/^0x[0-9a-f]+$/i.test(value))throw Error();return BigInt(value).toString();}
export async function walletTokens(wallet){
 if(!process.env.ALCHEMY_ROBINHOOD_RPC_URL)throw Error('Token discovery unavailable');
 const items=new Map(),seen=new Set();let pageKey=null,partial=false;
 for(let page=0;page<10;page++){
 const d=await rpc('alchemy_getTokenBalances',[wallet,'erc20',{maxCount:100,...(pageKey?{pageKey}:{})}]);if(!Array.isArray(d.tokenBalances))throw Error();
 for(const t of d.tokenBalances){if(t.error||!valid(t.contractAddress)||!/^0x[0-9a-f]+$/i.test(t.tokenBalance||'')){partial=true;continue;}if(positive(t.tokenBalance))items.set(addr(t.contractAddress),t.tokenBalance);}
 if(!d.pageKey)return {items,partial};if(seen.has(d.pageKey))return {items,partial:true};seen.add(d.pageKey);pageKey=d.pageKey;
 }return {items,partial:true};
}
export async function settledMap(items,fn,concurrency=4){const results=[];for(let i=0;i<items.length;i+=concurrency)results.push(...await Promise.allSettled(items.slice(i,i+concurrency).map(fn)));return results;}

