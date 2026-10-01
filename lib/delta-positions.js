import {keccak256} from '@ethersproject/keccak256';
import {addr,json,rpc,settledMap} from './protocol-utils.js';
import {liquidityAmounts,tokenPrice,valueV4Position} from './v4-valuation.js';

// Delta's official positions app supplies discovery, not proof of current ownership.
// https://deltaliquidity.app/positions (Robinhood deployment configuration)
const V3='0x73991a25c818bf1f1128deaab1492d45638de0d3';
const V4='0x58daec3116aae6d93017baaea7749052e8a04fa7';
const V3_FACTORY='0x1f7d7550b1b028f7571e69a784071f0205fd2efa';
const MANAGERS=new Set([
 '0x64680254bf644bbdde394b95129895c13317fed4','0xc5941433114bb47a9733cb31a0a3a3dbff45b418',
 '0x5ca6214227d1195c4b7b4b96847b8966c688295d','0xac6a35d097bb230eb9966ddd8e5970055a622d98',
 '0x077af3f17c0ef7bb04a9882e1955e9c23d2f9e91','0xf321ed71750c3e627a0f435c8950429f231e3497',
 '0x56bf0f5b26d888b989a9a20ec2164f0ca560836c','0xbcb96b15dc2246d242c879316c86e25e846ad5fb',
 '0x83551a233f6d7b3cb4defbf55abfd887c6811ce4'
]);
const selector=s=>keccak256(Buffer.from(s)).slice(0,10);
const word=n=>BigInt(n).toString(16).padStart(64,'0');
function words(hex,n){if(!new RegExp('^0x[0-9a-f]{'+n*64+'}$','i').test(hex))throw Error('Invalid Delta contract response');return hex.slice(2).match(/.{64}/g);}
const uint=w=>BigInt('0x'+w),address=w=>addr('0x'+w.slice(-40));
function symbol(hex,fallback){
 try{const h=hex.slice(2);if(h.length===64)return Buffer.from(h,'hex').toString('utf8').replace(/\0+$/,'').slice(0,40)||fallback;
 const offset=Number(uint(h.slice(0,64)))*2,len=Number(uint(h.slice(offset,offset+64)));
 if(len>80||offset+64+len*2>h.length)throw Error();return Buffer.from(h.slice(offset+64,offset+64+len*2),'hex').toString('utf8').slice(0,40)||fallback;
 }catch{return fallback;}
}

export async function deltaLadderPositions(wallet){
 wallet=addr(wallet);if(!wallet)throw Error('Invalid wallet');
 const [snapshot,block]=await Promise.all([
  json('https://deltaliquidity.app/ix/pnl/positions/'+wallet+'?open=1'),rpc('eth_blockNumber',[])
 ]);
 if(addr(snapshot.owner)!==wallet||!Array.isArray(snapshot.positions))throw Error('Invalid Delta snapshot');
 let partial=snapshot.stale!==false||snapshot.positions.length>80,budget=240;
 const readCache=new Map(),seen=new Set();
 const call=(to,data)=>{const key=to+data;if(!readCache.has(key))readCache.set(key,rpc('eth_call',[{to,data},block]));return readCache.get(key);};
 const metadata=async currency=>{
  if(currency==='0x'+'0'.repeat(40))return {symbol:'ETH',decimals:18};
  const [d,s]=await Promise.all([call(currency,'0x313ce567'),call(currency,'0x95d89b41').catch(()=>null)]);
  const decimals=Number(uint(words(d,1)[0]));if(decimals>36)throw Error('Invalid decimals');
  return {symbol:s?symbol(s,currency.slice(0,8)):currency.slice(0,8),decimals};
 };
 const results=await settledMap(snapshot.positions.slice(0,80),async p=>{
  if(p.isClosed===true)return null;
  if(!['v3','v4'].includes(p.version)||!String(p.id).startsWith('4663:'+p.version+':')||!Array.isArray(p.legIds))throw Error('Unsupported Delta position');
  if(p.custody!=='managed')throw Error('Unmanaged Delta position not covered');
  const pm=p.version==='v3'?V3:V4,ids=[];let capped=false;
  for(const id of p.legIds){if(!/^\d+$/.test(String(id)))throw Error('Invalid token ID');const canonical=BigInt(id).toString(),key=p.version+':'+canonical;
   if(seen.has(key))continue;if(budget--<=0){partial=true;capped=true;break;}seen.add(key);ids.push(canonical);}
  const legs=await settledMap(ids,async id=>{
   const encoded=word(id),manager=address(words(await call(pm,'0x6352211e'+encoded),1)[0]);
   // NFTs are held by the manager, so ordinary wallet NFT scans cannot find these.
   if(!MANAGERS.has(manager))return null;
   const owner=address(words(await call(manager,selector(p.version==='v3'?'ownerOfV3(uint256)':'ownerOfV4(uint256)')+encoded),1)[0]);
   if(owner!==wallet)return null;
   if(p.version==='v4'){
    const liquidity=uint(words(await call(pm,'0x1efeed33'+encoded),1)[0]);if(liquidity===0n)return null;
    const poolWords=words(await call(pm,'0x7ba03aad'+encoded),6);
    const v=await valueV4Position({liquidity,poolWords,tokenId:id,block,call});
    // Manager fees and deferred credits are not included in principal valuation.
    return {id,currencies:v.components.map(c=>c.currency),amounts:v.components.map(c=>BigInt(c.amountRaw)),inRange:v.inRange};
   }
   const state=words(await call(pm,'0x99fbab88'+encoded),12),liquidity=uint(state[7]);if(liquidity===0n)return null;
   const pool=addr(p.pool);if(!pool)throw Error('Missing Delta pool');
   const canonicalPool=address(words(await call(V3_FACTORY,selector('getPool(address,address,uint24)')+state[2]+state[3]+state[4]),1)[0]);
   if(canonicalPool!==pool)throw Error('Unrecognized Delta pool');
   const [t0,t1,fee,slot]=await Promise.all([call(pool,'0x0dfe1681'),call(pool,'0xd21220a7'),call(pool,'0xddca3f43'),call(pool,'0x3850c7bd')]);
   const currencies=[address(state[2]),address(state[3])];
   if(address(words(t0,1)[0])!==currencies[0]||address(words(t1,1)[0])!==currencies[1]||uint(words(fee,1)[0])!==uint(state[4]))throw Error('Delta pool mismatch');
   const slotWords=words(slot,7),lower=Number(BigInt.asIntN(24,uint(state[5]))),upper=Number(BigInt.asIntN(24,uint(state[6]))),tick=Number(BigInt.asIntN(24,uint(slotWords[1])));
   return {id,currencies,amounts:liquidityAmounts(liquidity,uint(slotWords[0]),lower,upper),inRange:tick>=lower&&tick<upper};
  });
  const incomplete=capped||legs.some(r=>r.status==='rejected');partial ||=incomplete;
  const active=legs.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value);if(!active.length)return null;
  const currencies=active[0].currencies;
  if(active.some(l=>l.currencies.join()!==currencies.join()))throw Error('Mixed Delta currencies');
  const totals=currencies.map((_,i)=>active.reduce((sum,l)=>sum+l.amounts[i],0n));
  const [meta,prices]=await Promise.all([Promise.all(currencies.map(metadata)),Promise.all(currencies.map(c=>tokenPrice(c).catch(()=>null)))]);
  const priced=totals.every((amount,i)=>amount===0n||prices[i]!==null);
  const value=priced&&!incomplete?totals.reduce((sum,n,i)=>sum+(n===0n?0:Number(n)/10**meta[i].decimals*prices[i].usd),0):null;
  if(value!==null&&!Number.isFinite(value))throw Error('Invalid Delta valuation');
  partial ||=value===null;
  return {id:'delta:ladder:'+p.id,contract:pm,tokenId:active.map(l=>l.id).join(', '),tokenIds:active.map(l=>l.id),protocol:'Delta',
   name:meta.map(m=>m.symbol).join(' / '),side:'Liquidity',rangeCount:active.length,inRange:active.some(l=>l.inRange),value,principalValue:value,
   estimated:true,feesIncluded:false,feesExcluded:true,valuationPartial:value===null,valuationSource:'On-chain liquidity principal · DexScreener prices',
   components:currencies.map((currency,i)=>({currency,decimals:meta[i].decimals,amountRaw:totals[i].toString(),feesRaw:null,priceUsd:prices[i]?.usd??null,priceAt:prices[i]?.at??null})),
   block,at:Date.now(),url:'https://deltaliquidity.app/positions'};
 });
 partial ||=results.some(r=>r.status==='rejected');
 return {items:results.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value),partial,block};
}
