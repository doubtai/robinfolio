let catalog=null;
const chain=4663,zero='0x'+'0'.repeat(40),valid=/^0x[0-9a-f]{40}$/i;
async function read(path,query=''){
 const response=await fetch('https://api.1inch.com/portfolio/portfolio/v5.0/'+path+query,{headers:{Authorization:`Bearer ${process.env.ONEINCH_API_KEY}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Provider unavailable');
 const body=await response.json(),rows=Array.isArray(body)?body:body.result;
 if(!Array.isArray(rows))throw Error('Invalid response');return rows;
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const address=String(req.query?.address||'').toLowerCase();
 if(address&&!valid.test(address))return res.status(400).json({error:'Invalid address'});
 if(!process.env.ONEINCH_API_KEY)return res.status(503).json({error:'Position indexer is not configured'});
 try{
 const [support,snapshot]=await Promise.allSettled([
 catalog&&catalog.until>Date.now()?catalog.rows:read('general/supported_protocols').then(rows=>{catalog={rows,until:Date.now()+3600000};return rows}),
 address?read('protocols/snapshot','?'+new URLSearchParams({chain_id:String(chain),addresses:address,use_cache:'true'})):Promise.resolve([])
 ]);
 if(snapshot.status==='rejected')throw Error();
 const supported=support.status==='fulfilled'?support.value.filter(r=>Number(r.chain_id??r.chain)===chain).map(r=>({id:String(r.protocol_group_id||''),name:String(r.protocol_group_name||''),type:String(r.protocol_type||'')})):null;
 const unique=new Map();let partial=supported===null;
 for(const row of snapshot.value){
 if(Number(row.chain_id??row.chain)!==chain||![address,zero].includes(String(row.address).toLowerCase())){partial=true;continue;}
 if(row.status!==1)continue;
 if(!valid.test(row.contract_address)||![1,-1].includes(row.asset_sign)){partial=true;continue;}
 const value=typeof row.value_usd==='number'&&Number.isFinite(row.value_usd)?Math.abs(row.value_usd):null;
 if(value===null)partial=true;
 const contract=row.contract_address.toLowerCase(),id=[row.protocol_group_id,row.protocol_handler_id,contract,row.token_id??'',row.index??'',row.asset_sign].join(':');
 unique.set(id,{id,contract,tokenId:row.token_id==null?null:String(row.token_id),protocol:String(row.protocol_group_name||row.protocol_group_id||'DeFi').slice(0,80),name:String(row.contract_name||row.contract_symbol||'Position').slice(0,120),symbol:String(row.contract_symbol||'').slice(0,40),side:row.asset_sign===-1?'Debt':'Deposit',value,at:typeof row.timestamp==='number'?row.timestamp*1000:null});
 }
 res.setHeader('Cache-Control','s-maxage=60,stale-while-revalidate=30');
 return res.status(200).json({address,chainId:chain,items:[...unique.values()],supported,partial,provider:'1inch',scope:'Indexed positions only. Unsupported protocols and positions may be missing.'});
 }catch{return res.status(502).json({error:'DeFi positions are temporarily unavailable'});}
}

