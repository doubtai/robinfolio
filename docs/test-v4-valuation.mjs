import assert from 'node:assert/strict';
import {liquidityAmounts,accruedFee,ticksFromInfo,valueV4Position,tokenPrice,STATE_VIEW} from '../lib/v4-valuation.js';
const Q=1n<<96n,F=1n<<128n,L=10n**18n,word=n=>BigInt.asUintN(256,BigInt(n)).toString(16).padStart(64,'0');
const packed=(BigInt.asUintN(24,-60n)<<8n)|(60n<<32n);
assert.deepEqual(ticksFromInfo(packed),{lower:-60,upper:60});
assert.deepEqual(liquidityAmounts(L,Q,-60,60),[2995354955910780n,2995354955910780n]);
assert.equal(liquidityAmounts(L,1n,-60,60)[1],0n);
assert.equal(liquidityAmounts(L,1n<<160n,-60,60)[0],0n);
assert.throws(()=>liquidityAmounts(L,Q,60,-60));
assert.equal(accruedFee(5n,(1n<<256n)-5n,F),10n);
const currency='0x'+'1'.repeat(40),poolWords=[word(0),currency.slice(2).padStart(64,'0'),word(1000),word(10),word(0),word(packed)];
let feesFail=false;
const call=async(to,data,block)=>{
 assert.equal(block,'0x123');
 if(to===currency){assert.equal(data,'0x313ce567');return '0x'+word(6);}
 assert.equal(to,STATE_VIEW);
 if(data.startsWith('0xc815641c'))return '0x'+[Q,0,0,1000].map(word).join('');
 if(feesFail)throw Error('Fee source unavailable');
 if(data.startsWith('0x53e9c1fb'))return '0x'+[F,2n*F].map(word).join('');
 assert(data.startsWith('0xdacf1d2f'));assert(data.endsWith(word(123)));return '0x'+[L,0,0].map(word).join('');
};
const price=async c=>({usd:c===currency?1:2000,at:1000});
let d=await valueV4Position({liquidity:L,poolWords,tokenId:'123',block:'0x123',call,price});
assert.equal(d.components[0].feesRaw,L.toString());assert.equal(d.components[1].decimals,6);assert(d.value>d.principalValue);assert(d.feesIncluded);assert(!d.valuationPartial);
assert(Math.abs(d.value-(Number(2995354955910780n+L)/1e18*2000+Number(2995354955910780n+2n*L)/1e6))<0.001);
feesFail=true;d=await valueV4Position({liquidity:L,poolWords,tokenId:'123',block:'0x123',call,price});assert.equal(d.value,d.principalValue);assert.equal(d.feesValue,null);assert(d.valuationPartial);
d=await valueV4Position({liquidity:L,poolWords,tokenId:'123',block:'0x123',call,price:async()=>{throw Error('Missing price')}});assert.equal(d.value,null);assert.equal(d.components.length,2);
globalThis.fetch=async()=>({ok:true,json:async()=>({pairs:[{chainId:'ethereum',baseToken:{address:currency},priceUsd:'99',liquidity:{usd:1e9}},{chainId:'robinhood',baseToken:{address:'0x'+'2'.repeat(40)},priceUsd:'98',liquidity:{usd:1e8}},{chainId:'robinhood',baseToken:{address:currency},priceUsd:'97',liquidity:{usd:2}},{chainId:'robinhood',baseToken:{address:currency},priceUsd:'1.25',liquidity:{usd:100000}}]})});
assert.equal((await tokenPrice(currency)).usd,1.25);
console.log('PASS range math, signed ticks, fee wrap, decimals, one-block reads, fee inclusion, missing prices, partial fee reads, exact chain/address pricing and liquidity filter');

