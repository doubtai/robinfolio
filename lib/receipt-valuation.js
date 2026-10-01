import {addr,rpc} from './protocol-utils.js';
import {tokenPrice} from './v4-valuation.js';

const word=n=>BigInt(n).toString(16).padStart(64,'0');
function uint(hex){if(!/^0x[0-9a-f]{64}$/i.test(hex))throw Error('Invalid receipt response');return BigInt(hex);}
function decimals(hex){const n=Number(uint(hex));if(n>36)throw Error('Invalid token decimals');return n;}
const cache=new Map();
// Documented public endpoint supports PT, YT, SY and LP, with distinct USD prices.
// https://docs.pendle.finance/pendle-v2-dev/Backend/ApiOverview
export async function pendlePrices(contracts){
 const unique=[...new Set(contracts.map(addr).filter(Boolean))].sort(),result=new Map();
 for(let offset=0;offset<unique.length;offset+=20){
  const batch=unique.slice(offset,offset+20),key=batch.join(','),old=cache.get(key);let promise;
  if(old&&old.until>Date.now())promise=old.promise;
  else {
   promise=(async()=>{
    const query=new URLSearchParams({chainId:'4663',ids:batch.map(c=>'4663-'+c).join(',')});
    const r=await fetch('https://api-v2.pendle.finance/core/v1/prices/assets?'+query,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Pendle prices unavailable');
    const d=await r.json(),map=d.prices??d.priceMap;if(!map||typeof map!=='object'||Array.isArray(map))throw Error('Invalid Pendle prices');
    const found=new Map();
    for(const contract of batch){const row=map['4663-'+contract],raw=typeof row==='object'&&row!==null?row.usd:row;
     if(typeof raw==='number'&&Number.isFinite(raw)&&raw>=0)found.set(contract,{usd:raw,at:Date.now()});
    }
    return found;
   })();cache.set(key,{promise,until:Date.now()+60000});
  }
  try{for(const [c,p] of await promise)result.set(c,p);}catch{cache.delete(key);}
 }
 return result;
}

export async function receiptValue({protocol,contract,wallet,market,price}){
 const block=await rpc('eth_blockNumber',[]);
 const call=(to,data)=>rpc('eth_call',[{to,data},block]);
 const shares=uint(await call(contract,'0x70a08231'+word(wallet)));if(shares===0n)return null;
 const base={balanceRaw:String(shares),block,value:null,valuationPartial:true};
 // Keep the holding visible even when its conversion or price source is unavailable.
 try{
  let currency=contract,amount=shares,tokenDecimals,unitPrice=price,symbol;
  if(protocol==='Longbow'){
   const [asset,converted]=await Promise.all([call(contract,'0x38d52e0f'),call(contract,'0x07a2d13a'+word(shares))]);
   currency='0x'+word(uint(asset)).slice(-40);
   if(!market.assets.includes(currency))throw Error('Vault asset mismatch');
   amount=uint(converted);tokenDecimals=decimals(await call(currency,'0x313ce567'));symbol=market.assetSymbol;
   unitPrice=await tokenPrice(currency);
  }else {tokenDecimals=decimals(await call(contract,'0x313ce567'));}
  if(!unitPrice||!Number.isFinite(unitPrice.usd)||unitPrice.usd<0)throw Error('No receipt price');
  const value=Number(amount)/10**tokenDecimals*unitPrice.usd;if(!Number.isFinite(value))throw Error('Invalid receipt valuation');
  return {...base,value,valuationPartial:false,estimated:true,at:Date.now(),feesExcluded:true,
   valuationSource:protocol==='Longbow'?'On-chain vault conversion · DexScreener underlying price':'On-chain balance · Pendle token price',
   components:[{currency,symbol,decimals:tokenDecimals,amountRaw:String(amount),feesRaw:null,priceUsd:unitPrice.usd,priceAt:unitPrice.at}],
   ...(protocol==='Longbow'?{underlyingAsset:currency,underlyingAmountRaw:String(amount)}:{})};
 }catch{return base;}
}
