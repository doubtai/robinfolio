import assert from 'node:assert/strict';
import {uniswapV3Positions,POSITION_MANAGER as pm} from '../lib/uniswap-v3.js';
const wallet='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),pool='0x'+'3'.repeat(40),tokens=['0x'+'4'.repeat(40),'0x'+'5'.repeat(40)];
const factory='0x1f7d7550b1b028f7571e69a784071f0205fd2efa',word=n=>BigInt.asUintN(256,BigInt(n)).toString(16).padStart(64,'0'),encode=(...n)=>'0x'+n.map(word).join('');
let feeFails=false,transferred=false,empty=false;
process.env.ALCHEMY_ROBINHOOD_RPC_URL='https://v3.test';
globalThis.fetch=async(url,options={})=>{
 let body;
 if(url.includes('dexscreener'))body={pairs:[{chainId:'robinhood',baseToken:{address:url.split('/').at(-1)},priceUsd:2,liquidity:{usd:100000}}]};
 else {const r=JSON.parse(options.body);if(r.method==='eth_blockNumber')body={result:'0x123'};
 else {assert.equal(r.params[1],'0x123');const {to,data}=r.params[0],s=data.slice(0,10);let value;
  if(to===pm){if(s==='0x70a08231')value=encode(empty?0:1);else if(s==='0x2f745c59')value=encode(7);else if(s==='0x6352211e')value=encode(transferred?other:wallet);else if(s==='0x99fbab88')value=encode(0,0,...tokens,3000,-60,60,10n**18n,0,0,0,0);}
  else if(to===factory)value=encode(pool);
  else if(to===pool){if(s==='0x3850c7bd')value=encode(1n<<96n,0,0,0,0,0,1);else{if(feeFails)throw Error('fee read unavailable');value=s==='0xf30dba93'?encode(0,0,0,0,0,0,0,1):encode(1n<<128n);}}
  else if(tokens.includes(to))value=s==='0x313ce567'?encode(18):'0x'+Buffer.from('TOKEN').toString('hex').padEnd(64,'0');
  assert(value,'Unexpected RPC call '+s);body={result:value};
 }}return {ok:true,json:async()=>body};
};
let d=await uniswapV3Positions(wallet),p=d.items[0];assert.equal(d.partial,false);assert.equal(p.tokenId,'7');assert.equal(p.components[0].amountRaw,'2995354955910780');assert.equal(p.components[0].feesRaw,'1000000000000000000');assert(Math.abs(p.value-4.011981419823644)<1e-14);
feeFails=true;d=await uniswapV3Positions(wallet);assert(d.partial);assert.equal(d.items[0].feesIncluded,false);assert(d.items[0].value>0);feeFails=false;
transferred=true;assert.equal((await uniswapV3Positions(wallet)).items.length,0);transferred=false;
empty=true;d=await uniswapV3Positions(wallet);assert.equal(d.items.length,0);assert.equal(d.partial,false);
console.log('PASS V3 NFT enumeration, ownership, fixed block, range amounts, accrued fees and isolated fee failure');
