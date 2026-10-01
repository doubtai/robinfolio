import assert from 'node:assert/strict';
import {keccak256} from '@ethersproject/keccak256';
import {deltaLadderPositions} from '../lib/delta-positions.js';

const wallet='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),pool='0x'+'3'.repeat(40);
const tokens=['0x'+'4'.repeat(40),'0x'+'5'.repeat(40)];
const manager='0x83551a233f6d7b3cb4defbf55abfd887c6811ce4';
const pm='0x73991a25c818bf1f1128deaab1492d45638de0d3';
const factory='0x1f7d7550b1b028f7571e69a784071f0205fd2efa';
const word=n=>BigInt.asUintN(256,BigInt(n)).toString(16).padStart(64,'0');
const encode=(...n)=>'0x'+n.map(word).join('');
const signature=s=>keccak256(Buffer.from(s)).slice(0,10);
let failLeg=false,stale=false,wrongOwner=false,closed=false,seen=[];
process.env.ALCHEMY_ROBINHOOD_RPC_URL='https://delta-rpc.test';
globalThis.fetch=async(url,options={})=>{
 let body;
 if(url.includes('/ix/pnl/positions/'))body={owner:wrongOwner?other:wallet,stale,positions:[
  {id:'4663:v3:open',version:'v3',custody:'managed',pool,isClosed:closed,legIds:['1','2','3','4','1']},
  {id:'4663:v3:closed',version:'v3',custody:'managed',pool,isClosed:true,legIds:['99']}
 ]};
 else if(url.startsWith('https://api.dexscreener.com/'))body={pairs:[{chainId:'robinhood',baseToken:{address:url.split('/').at(-1)},priceUsd:'2',liquidity:{usd:50000}}]};
 else if(url==='https://delta-rpc.test'){
  const r=JSON.parse(options.body);
  if(r.method==='eth_blockNumber')body={result:'0x123'};
  else {
   assert.equal(r.method,'eth_call');assert.equal(r.params[1],'0x123','all balances must use one block');
   const {to,data}=r.params[0],s=data.slice(0,10);let result;
   if(to===pm){const id=Number(BigInt('0x'+data.slice(10)));seen.push(id);assert.notEqual(id,99,'closed ladders must be excluded');
    if(failLeg&&id===2)throw Error('RPC temporary failure');
    if(s==='0x6352211e')result=encode(manager);
    else if(s==='0x99fbab88')result=encode(0,0,...tokens,3000,-60,60,id===4?0:10n**18n,0,0,0,0);
    else assert.fail('Unexpected NFT method');
   }else if(to===manager){assert.equal(s,signature('ownerOfV3(uint256)'));result=encode(data.endsWith(word(3))?other:wallet);}
   else if(to===factory){assert.equal(s,signature('getPool(address,address,uint24)'));result=encode(pool);}
   else if(to===pool){result=({'0x0dfe1681':encode(tokens[0]),'0xd21220a7':encode(tokens[1]),'0xddca3f43':encode(3000),'0x3850c7bd':encode(1n<<96n,0,0,0,0,0,1)})[s];}
   else if(tokens.includes(to)){result=s==='0x313ce567'?encode(18):'0x'+Buffer.from(to===tokens[0]?'ETH':'DELTA').toString('hex').padEnd(64,'0');}
   if(!result)assert.fail('Unexpected read '+to+' '+s);body={result};
  }
 }else return {ok:false,status:503,json:async()=>({})};
 return {ok:true,json:async()=>body};
};
let d=await deltaLadderPositions(wallet);
assert.equal(d.partial,false);assert.equal(d.items.length,1);
const p=d.items[0];assert.deepEqual(p.tokenIds,['1','2']);assert.equal(p.rangeCount,2);
assert.equal(p.components[0].amountRaw,'5990709911821560');assert.equal(p.components[1].amountRaw,'5990709911821560');
assert(Math.abs(p.value-0.02396283964728624)<1e-15);assert.equal(p.feesIncluded,false);assert.equal(p.feesExcluded,true);
assert.equal(seen.filter(n=>n===1).length,2,'one owner and one position read per unique NFT');
failLeg=true;d=await deltaLadderPositions(wallet);assert.equal(d.partial,true);assert.equal(d.items.length,1);assert.equal(d.items[0].value,null,'incomplete ladder must not show a full valuation');failLeg=false;
stale=true;assert.equal((await deltaLadderPositions(wallet)).partial,true);stale=false;
wrongOwner=true;await assert.rejects(deltaLadderPositions(wallet),/Invalid Delta snapshot/);wrongOwner=false;
closed=true;d=await deltaLadderPositions(wallet);assert.equal(d.items.length,0);closed=false;
// A farm catalog outage must not remove verified ladder positions.
const {expandedPositions}=await import('../lib/expanded-positions.js');
d=await expandedPositions(wallet);assert(d.items.some(p=>p.protocol==='Delta'&&p.rangeCount===2));assert.equal(d.sources.find(s=>s.name==='Delta').status,'partial');
console.log('PASS Delta custody, closed/transferred/empty positions, range deduplication, exact amounts, fixed block, incomplete valuation, stale index, owner validation and farm outage isolation');
