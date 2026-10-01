const periods={ '1day':86400,'1week':7*86400,'1month':31*86400 };
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const address=String(req.query?.address||'').toLowerCase(),period=String(req.query?.period||'1month');
  if(!/^0x[0-9a-f]{40}$/.test(address)||!Object.hasOwn(periods,period))return res.status(400).json({error:'Invalid request'});
  const key=process.env.ONEINCH_API_KEY;
  if(!key)return res.status(503).json({code:'HISTORY_NOT_CONFIGURED'});
  try{
    const query=new URLSearchParams({chain_id:'4663',addresses:address,timerange:period,use_cache:'true'});
    const upstream=await fetch('https://api.1inch.com/portfolio/portfolio/v5.0/general/chart?'+query,{headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
    if(!upstream.ok)return res.status(502).json({code:upstream.status===429?'HISTORY_RATE_LIMITED':'HISTORY_UNAVAILABLE'});
    const body=await upstream.json();
    if(!Array.isArray(body.result))throw new Error('Invalid history');
    const now=Math.floor(Date.now()/1000),cutoff=now-periods[period],points=new Map();
    let partial=false;
    for(const row of body.result){
      if(typeof row.timestamp!=='number'||!Number.isInteger(row.timestamp)||typeof row.value_usd!=='number'||!Number.isFinite(row.value_usd)||row.value_usd<0){partial=true;continue;}
      if(row.timestamp>now){partial=true;continue;}
      if(row.timestamp<cutoff)continue;
      points.set(row.timestamp,{at:row.timestamp*1000,value:row.value_usd});
    }
    const issues=body.meta?.data_issues;
    if(issues&&Object.values(issues).some(value=>Array.isArray(value)?value.length>0:Boolean(value)))partial=true;
    res.setHeader('Cache-Control','s-maxage=300,stale-while-revalidate=60');
    return res.status(200).json({chainId:4663,address,period,provider:'1inch',coverage:'Indexed assets and protocols only',partial,points:[...points.values()].sort((a,b)=>a.at-b.at)});
  }catch{return res.status(502).json({code:'HISTORY_UNAVAILABLE'});}
}

