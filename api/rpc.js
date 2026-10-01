const PUBLIC_RPC='https://rpc.mainnet.chain.robinhood.com';
export default async function handler(request,response){
  if(request.method!=='POST')return response.status(405).json({error:'Method not allowed'});
  const method=String(request.body?.method||'');
  const allowed=new Set(['eth_blockNumber','eth_getBalance','eth_call','eth_getCode','eth_getLogs','eth_getTransactionReceipt','eth_chainId']);
  if(!allowed.has(method))return response.status(400).json({error:'Unsupported RPC method'});
  const upstream=process.env.ALCHEMY_ROBINHOOD_RPC_URL||PUBLIC_RPC;
  try{
    const result=await fetch(upstream,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:Array.isArray(request.body.params)?request.body.params:[]})});
    const payload=await result.json();
    response.setHeader('Cache-Control',method==='eth_blockNumber'?'s-maxage=2,stale-while-revalidate=4':'s-maxage=8,stale-while-revalidate=20');
    return response.status(result.ok?200:502).json(payload);
  }catch{return response.status(502).json({error:'Robinhood Chain RPC is temporarily unavailable'});}
}

