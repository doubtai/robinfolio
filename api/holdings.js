const addressPattern=/^0x[\da-f]{40}$/i;
const uintPattern=/^0x[\da-f]+$/i;
const text=value=>String(value??'').slice(0,160);
function units(raw,decimals){
  if(!Number.isInteger(decimals)||decimals<0||decimals>255)return null;
  const digits=BigInt(raw).toString().padStart(decimals+1,'0');
  return decimals?digits.slice(0,-decimals)+(digits.slice(-decimals).replace(/0+$/,'')?'.'+digits.slice(-decimals).replace(/0+$/,''):''):digits;
}
async function json(url,options={}){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(({400:'provider_rejected_request',401:'provider_unauthorized',403:'provider_forbidden',404:'provider_endpoint_unavailable',429:'rate_limited'})[response.status]||'provider_unavailable');
  const result=await response.json();
  if(result.error)throw new Error('provider_unavailable');
  return result;
}
async function rpc(endpoint,method,params){
  const body=await json(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if(body.result===undefined)throw new Error('invalid_response');
  return body.result;
}
export default async function handler(request,response){
  if(request.method!=='GET')return response.status(405).json({error:'Method not allowed'});
  const address=String(request.query?.address||'');
  const kind=String(request.query?.kind||'tokens');
  const pageKey=String(request.query?.pageKey||'');
  if(!addressPattern.test(address)||!['tokens','nfts'].includes(kind)||pageKey.length>2048)return response.status(400).json({error:'Invalid request'});
  const endpoint=process.env.ALCHEMY_ROBINHOOD_RPC_URL;
  if(!endpoint)return response.status(503).json({status:'unconfigured',error:'Asset indexer is not configured'});
  try{
    const root=new URL(endpoint);
    if(root.protocol!=='https:'||root.hostname!=='robinhood-mainnet.g.alchemy.com'||!/^\/v2\/[^/]+$/.test(root.pathname))throw new Error('configuration_error');
    let items=[],nextPageKey=null,partial=false;
    if(kind==='tokens'){
      const data=await rpc(endpoint,'alchemy_getTokenBalances',[address,'erc20',{maxCount:8,...(pageKey?{pageKey}:{})}]);
      if(!Array.isArray(data.tokenBalances))throw new Error('invalid_response');
      nextPageKey=data.pageKey||null;
      partial=data.tokenBalances.some(token=>token.error||!addressPattern.test(token.contractAddress)||!uintPattern.test(token.tokenBalance||''));
      const balances=data.tokenBalances.filter(token=>!token.error&&addressPattern.test(token.contractAddress)&&uintPattern.test(token.tokenBalance||'')&&BigInt(token.tokenBalance)>0n);
      if(balances.length>8)throw new Error('invalid_response');
      for(let index=0;index<balances.length;index+=4){
        items.push(...await Promise.all(balances.slice(index,index+4).map(async token=>{
          let metadata={};try{metadata=await rpc(endpoint,'alchemy_getTokenMetadata',[token.contractAddress]);}catch{partial=true;}
          return {contract:token.contractAddress,name:text(metadata.name||'Unknown token'),symbol:text(metadata.symbol||'ERC-20'),balanceRaw:token.tokenBalance,decimals:Number.isInteger(metadata.decimals)?metadata.decimals:null,balance:units(token.tokenBalance,metadata.decimals)};
        })));
      }
    }else{
      const key=root.pathname.split('/')[2];
      const url=new URL(`/nft/v3/${key}/getNFTsForOwner`,root.origin);
      url.search=new URLSearchParams({owner:address,withMetadata:'true',pageSize:'20',...(pageKey?{pageKey}:{})}).toString();
      const data=await json(url);
      if(!Array.isArray(data.ownedNfts))throw new Error('invalid_response');
      nextPageKey=data.pageKey||null;
      items=data.ownedNfts.filter(nft=>addressPattern.test(nft.contract?.address)&&/^(0x[\da-f]+|\d+)$/i.test(nft.tokenId||'')).map(nft=>({contract:nft.contract.address,tokenId:text(nft.tokenId),name:text(nft.name||nft.contract.name||'Untitled NFT'),type:text(nft.tokenType),balance:text(nft.balance||'1')}));
      partial=items.length!==data.ownedNfts.length;
    }
    response.setHeader('Cache-Control','s-maxage=20,stale-while-revalidate=20');
    return response.status(200).json({address,kind,status:'available',provider:'Alchemy',items,nextPageKey,partial});
  }catch(error){
    const reason=['rate_limited','configuration_error','invalid_response','provider_rejected_request','provider_unauthorized','provider_forbidden','provider_endpoint_unavailable'].includes(error.message)?error.message:'provider_unavailable';
    return response.status(502).json({status:'unavailable',reason,error:'Asset data is temporarily unavailable'});
  }
}

