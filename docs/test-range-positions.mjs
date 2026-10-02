import assert from 'node:assert/strict';
import {ramsesPositions,parseRamsesTick} from '../lib/range-positions.js';
const wallet='0x'+'1'.repeat(40),pool='0x'+'2'.repeat(40),a='0x'+'3'.repeat(40),b='0x'+'4'.repeat(40),ref='4663:'+pool;
const word=n=>BigInt.asUintN(256,BigInt(n)).toString(16).padStart(64,'0');
assert.equal(parseRamsesTick(ref+':-197546',ref),-197546);
assert.throws(()=>parseRamsesTick('1:'+pool+':12',ref));
assert.throws(()=>parseRamsesTick(ref+':NaN',ref));
let fail=false;
globalThis.fetch=async(url,options={})=>{
 let d;if(url.includes('subgraph'))d={data:{ClPosition:[{id:'4663:1',owner:wallet,chainId:4663,pool:ref,liquidity:'1000000000000000000',tickLower:ref+':-100',tickUpper:ref+':100'}]}};
 else if(url.includes('dexscreener'))d={pairs:[{chainId:'robinhood',baseToken:{address:a},quoteToken:{address:b},priceUsd:2,priceNative:2,liquidity:{usd:1e6}}]};
 else{const r=JSON.parse(options.body);if(r.method==='eth_blockNumber')d={result:'0x123'};else{
  assert.equal(r.params[1],'0x123');const data=r.params[0].data;if(fail)throw Error('RPC unavailable');
  const v=data==='0x3850c7bd'?[1n<<96n,0n]:data==='0x0dfe1681'?[a]:data==='0xd21220a7'?[b]:[18];d={result:'0x'+v.map(word).join('')};
 }}return {ok:true,json:async()=>d};
};
let r=await ramsesPositions(wallet);assert.equal(r.items.length,1);assert(r.items[0].value>0.014&&r.items[0].value<0.016);assert(r.items[0].inRange);assert(r.items[0].feesExcluded);
fail=true;r=await ramsesPositions(wallet);assert.equal(r.items.length,1);assert.equal(r.items[0].value,null);assert(r.partial);
console.log('PASS namespaced ticks, chain isolation, concentrated valuation, one-block reads and failure preserves holding');
