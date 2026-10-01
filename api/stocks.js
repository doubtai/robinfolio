const addressPattern=/^0x[\da-f]{40}$/i;
const featured=['NVDA','AAPL','GOOGL','SPCX','MSFT','AMZN','META','TSLA'];
let cached=null;
async function read(url,options={}){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Unavailable');
  const body=await response.json();if(body.error)throw new Error('Unavailable');return body;
}
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const address=String(req.query?.address||'');
  if(address&&!addressPattern.test(address))return res.status(400).json({error:'Invalid address'});
  try{
    if(!cached||Date.now()-cached.at>3600000){
      const body=await read('https://api.robinhood.com/rhj/assets');
      if(!Array.isArray(body.assets))throw new Error('Invalid catalog');
      const items=featured.flatMap(symbol=>body.assets.filter(a=>a.tokenSymbol===symbol).flatMap(a=>(a.deployments||[]).filter(d=>d.chainId===4663&&addressPattern.test(d.contractAddress)).map(d=>({symbol,name:String(a.tokenName).slice(0,160),contract:d.contractAddress,verifiedOrigin:'Robinhood Stock Token'}))));
      cached={at:Date.now(),items};
    }
    let partial=false;
    const items=cached.items.map(item=>({...item,logo:'https://cdn.robinhood.com/ncw_assets/logos/'+item.contract.toLowerCase()+'.png',balance:null}));
    if(address&&items.length){
      const endpoint=process.env.ALCHEMY_ROBINHOOD_RPC_URL;
      if(!endpoint){partial=true;}else{
        const root=new URL(endpoint);
        if(root.protocol!=='https:'||root.hostname!=='robinhood-mainnet.g.alchemy.com'||!/^\/v2\/[^/]+$/.test(root.pathname))throw new Error('Invalid provider');
        const rpc=async(method,params)=>(await read(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).result;
        try{
          const result=await rpc('alchemy_getTokenBalances',[address,items.map(item=>item.contract)]);
          if(!Array.isArray(result?.tokenBalances))throw new Error('Invalid balances');
          await Promise.all(items.map(async item=>{
            const row=result.tokenBalances.find(r=>r.contractAddress?.toLowerCase()===item.contract.toLowerCase());
            if(row?.error||!/^0x[\da-f]+$/i.test(row?.tokenBalance||'')){partial=true;return;}
            item.balanceRaw=row.tokenBalance;
            if(BigInt(row.tokenBalance)===0n){item.balance='0';return;}
            try{
              const meta=await rpc('alchemy_getTokenMetadata',[item.contract]);
              const decimals=meta?.decimals;if(!Number.isInteger(decimals)||decimals<0||decimals>255)throw new Error('Invalid decimals');
              const raw=BigInt(row.tokenBalance).toString().padStart(decimals+1,'0');
              item.balance=decimals?raw.slice(0,-decimals)+(raw.slice(-decimals).replace(/0+$/,'')?'.'+raw.slice(-decimals).replace(/0+$/,''):''):raw;
            }catch{partial=true;}
          }));
        }catch{partial=true;}
      }
    }
    res.setHeader('Cache-Control',address?'s-maxage=20':'s-maxage=3600');
    return res.status(200).json({items,partial,address:address||null,chainId:4663,source:'Robinhood official asset catalog'});
  }catch{return res.status(502).json({error:'Stock catalog is temporarily unavailable'});}
}

