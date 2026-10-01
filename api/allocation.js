export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const address=String(req.query?.address||'').toLowerCase();
  if(!/^0x[0-9a-f]{40}$/.test(address))return res.status(400).json({error:'Invalid address'});
  if(!process.env.ONEINCH_API_KEY)return res.status(503).json({error:'Valuation is not configured'});
  try{
    const query=new URLSearchParams({chain_id:'4663',addresses:address,use_cache:'true'});
    const upstream=await fetch('https://api.1inch.com/portfolio/portfolio/v5.0/tokens/snapshot?'+query,{headers:{Authorization:`Bearer ${process.env.ONEINCH_API_KEY}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
    if(!upstream.ok)throw new Error('Unavailable');
    const body=await upstream.json();
    const rows=Array.isArray(body)?body:body.result;
    if(!Array.isArray(rows))throw new Error('Invalid response');
    const unique=new Map();let partial=false;
    for(const row of rows){
      if(row.chain_id!==4663||String(row.address).toLowerCase()!==address){partial=true;continue;}
      if(row.status!==1||row.asset_sign!==1)continue;
      const contract=String(row.contract_address||'').toLowerCase();
      if(!/^0x[0-9a-f]{40}$/.test(contract)){partial=true;continue;}
      const value=typeof row.value_usd==='number'&&Number.isFinite(row.value_usd)&&row.value_usd>=0?row.value_usd:null;
      if(value===null)partial=true;
      const token=(row.underlying_tokens||[]).find(t=>String(t?.address||t?.contract_address||'').toLowerCase()===contract);
      const logo=token?.logo_url||token?.logo_uri||token?.icon_url||null;
      unique.set(contract,{contract,symbol:String(row.contract_symbol||'Token').slice(0,40),value,logo:typeof logo==='string'&&logo.startsWith('https://')?logo:null,at:typeof row.timestamp==='number'?row.timestamp*1000:null});
    }
    res.setHeader('Cache-Control','s-maxage=60,stale-while-revalidate=30');
    return res.status(200).json({address,chainId:4663,items:[...unique.values()],partial,provider:'1inch',scope:'Wallet tokens only; excludes DeFi and NFTs'});
  }catch{return res.status(502).json({error:'Token valuations are temporarily unavailable'});}
}

