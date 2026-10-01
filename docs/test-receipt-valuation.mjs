import assert from 'node:assert/strict';
import {pendlePrices,receiptValue} from '../lib/receipt-valuation.js';
const wallet='0x'+'1'.repeat(40),vault='0x'+'2'.repeat(40),asset='0x'+'3'.repeat(40),pt='0x'+'4'.repeat(40),yt='0x'+'5'.repeat(40),missing='0x'+'6'.repeat(40);
const word=n=>BigInt(n).toString(16).padStart(64,'0');
let converted=1250000n,convertFails=false,shares=10n**18n;
process.env.ALCHEMY_ROBINHOOD_RPC_URL='https://receipts.test';
globalThis.fetch=async(url,options={})=>{
 let body;
 if(url.includes('/v1/prices/assets?')){
  assert.equal(new URL(url).searchParams.get('chainId'),'4663');
  body={prices:{['4663-'+pt]:200,['4663-'+yt]:0.5,['1-'+missing]:999},errors:[{message:'One unrelated asset missing'}]};
 }else if(url.includes('dexscreener'))body={pairs:[
  {chainId:'ethereum',baseToken:{address:asset},priceUsd:100,liquidity:{usd:1e9}},
  {chainId:'robinhood',baseToken:{address:pt},quoteToken:{address:asset},priceUsd:200,priceNative:200,liquidity:{usd:1e6}}
 ]};
 else {
  const r=JSON.parse(options.body);if(r.method==='eth_blockNumber')body={result:'0x123'};
  else {assert.equal(r.params[1],'0x123');const {to,data}=r.params[0];let n;
   if(data.startsWith('0x70a08231'))n=shares;
   else if(data==='0x38d52e0f')n=asset;
   else if(data.startsWith('0x07a2d13a')){if(convertFails)throw Error('conversion failed');assert.equal(BigInt('0x'+data.slice(10)),shares);n=converted;}
   else if(data==='0x313ce567')n=to===asset?6:18;
   else assert.fail('Unexpected call '+data);
   body={result:'0x'+word(n)};
  }
 }
 return {ok:true,json:async()=>body};
};
const prices=await pendlePrices([pt,yt,missing]);assert.equal(prices.get(pt).usd,200);assert.equal(prices.get(yt).usd,0.5);assert.equal(prices.has(missing),false);
const market={assets:[asset],assetSymbol:'USDG'};
let p=await receiptValue({protocol:'Longbow',contract:vault,wallet,market});assert.equal(p.value,1.25);assert.equal(p.underlyingAmountRaw,'1250000');assert.equal(p.components[0].symbol,'USDG');
for(const [contract,value] of [[pt,200],[yt,0.5]]){p=await receiptValue({protocol:'Pendle',contract,wallet,market,price:prices.get(contract)});assert.equal(p.value,value);}
p=await receiptValue({protocol:'Pendle',contract:yt,wallet,market,price:{usd:0}});assert.equal(p.value,0,'an explicit zero YT price must remain valid');
p=await receiptValue({protocol:'Pendle',contract:missing,wallet,market});assert.equal(p.value,null);assert(p.balanceRaw);assert(p.valuationPartial);
convertFails=true;p=await receiptValue({protocol:'Longbow',contract:vault,wallet,market});assert.equal(p.value,null);assert.equal(p.balanceRaw,String(shares));convertFails=false;
shares=0n;assert.equal(await receiptValue({protocol:'Longbow',contract:vault,wallet,market}),null);
console.log('PASS distinct PT/YT prices, partial pricing, chain isolation, quote-token conversion, vault share/asset decimal mismatch, missing prices and zero balance');
