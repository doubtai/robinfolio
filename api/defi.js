import {uniswapV4Positions} from '../lib/uniswap-v4.js';
import {uniswapV3Positions,POSITION_MANAGER as V3_MANAGER} from '../lib/uniswap-v3.js';
import {morphoPositions,upPositions} from '../lib/defi-sources.js';
let catalog=null;
const chain=4663,zero='0x'+'0'.repeat(40),valid=/^0x[0-9a-f]{40}$/i;
async function read(path,query=''){
 if(!process.env.ONEINCH_API_KEY)throw Error('Indexer not configured');
 const response=await fetch('https://api.1inch.com/portfolio/portfolio/v5.0/'+path+query,{headers:{Authorization:`Bearer ${process.env.ONEINCH_API_KEY}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Provider unavailable');
 const body=await response.json(),rows=Array.isArray(body)?body:body.result;
 if(!Array.isArray(rows))throw Error('Invalid response');return rows;
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const address=String(req.query?.address||'').toLowerCase();
 if(address&&!valid.test(address))return res.status(400).json({error:'Invalid address'});
 
 try{
 const [support,snapshot,morphoResult,upResult,v4Result,v3Result]=await Promise.allSettled([
 catalog&&catalog.until>Date.now()?catalog.rows:read('general/supported_protocols').then(rows=>{catalog={rows,until:Date.now()+3600000};return rows}),
 address?read('protocols/snapshot','?'+new URLSearchParams({chain_id:String(chain),addresses:address,use_cache:'true'})):Promise.resolve([]),
 address?morphoPositions(address):Promise.resolve(null),
 address?upPositions(address):Promise.resolve(null),
 address?uniswapV4Positions(address):Promise.resolve(null),
 address?uniswapV3Positions(address):Promise.resolve(null)
 ]);
 if(address&&[snapshot,morphoResult,upResult,v4Result,v3Result].every(r=>r.status==='rejected'))throw Error();
 const supported=support.status==='fulfilled'?support.value.filter(r=>Number(r.chain_id??r.chain)===chain).map(r=>({id:String(r.protocol_group_id||''),name:String(r.protocol_group_name||''),type:String(r.protocol_type||'')})):null;
 const unique=new Map();let partial=supported===null||snapshot.status==='rejected';
 for(const row of snapshot.status==='fulfilled'?snapshot.value:[]){
 if(/morpho|^up$|^robinhood$/i.test(String(row.protocol_group_name||'')))continue;
 // Prefer verified V3 NFTs without double-counting an indexed copy.
 if(String(row.contract_address).toLowerCase()===V3_MANAGER&&v3Result.status==='fulfilled'&&v3Result.value&&(!v3Result.value.partial||v3Result.value.items.some(p=>p.tokenId===String(row.token_id))))continue;
 if(Number(row.chain_id??row.chain)!==chain||![address,zero].includes(String(row.address).toLowerCase())){partial=true;continue;}
 if(row.status!==1)continue;
 if(!valid.test(row.contract_address)||![1,-1].includes(row.asset_sign)){partial=true;continue;}
 const value=typeof row.value_usd==='number'&&Number.isFinite(row.value_usd)?Math.abs(row.value_usd):null;
 if(value===null)partial=true;
 const contract=row.contract_address.toLowerCase(),id=[row.protocol_group_id,row.protocol_handler_id,contract,row.token_id??'',row.index??'',row.asset_sign].join(':');
 unique.set(id,{id,contract,tokenId:row.token_id==null?null:String(row.token_id),protocol:String(row.protocol_group_name||row.protocol_group_id||'DeFi').slice(0,80),name:String(row.contract_name||row.contract_symbol||'Position').slice(0,120),symbol:String(row.contract_symbol||'').slice(0,40),side:row.asset_sign===-1?'Debt':'Deposit',value,at:typeof row.timestamp==='number'?row.timestamp*1000:null});
 }
 const sources=[{name:'Uniswap V2/V3',status:snapshot.status==='fulfilled'?'available':'unavailable',scope:'1inch indexed Uniswap V2/V3 coverage'}];
 for(const [name,result] of [['Morpho',morphoResult],['Uniswap V3',v3Result],['Uniswap V4',v4Result],['up',upResult]]){const data=result.status==='fulfilled'?result.value:null;sources.push({name,status:!address?'not_checked':data?(data.stale?'stale':data.partial?'partial':'available'):'unavailable',indexedAt:data?.indexedAt||null,scope:data?.scope||'Position source unavailable'});if(data){for(const item of data.items)unique.set(item.id,item);partial=partial||data.partial;}else if(address)partial=true;}
 res.setHeader('Cache-Control','s-maxage=15');
 return res.status(200).json({address,chainId:chain,items:[...unique.values()],supported,sources,partial,provider:'1inch, Morpho, up, on-chain',scope:'Indexed positions only. Unsupported protocols and positions may be missing.'});
 }catch{return res.status(502).json({error:'DeFi positions are temporarily unavailable'});}
}
