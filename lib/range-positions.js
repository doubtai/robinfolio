import {json,rpc,addr,positive,settledMap} from './protocol-utils.js';
import {liquidityAmounts,tokenPrice} from './v4-valuation.js';
import {keccak256} from '@ethersproject/keccak256';
import {fablesRegistry} from './fables-registry.js';
const word=n=>BigInt.asUintN(256,BigInt(n)).toString(16).padStart(64,'0');
const address=n=>'0x'+word(n).slice(-40);
const selector=s=>keccak256(Buffer.from(s)).slice(0,10);
const words=h=>{if(!/^0x(?:[0-9a-f]{64})+$/i.test(h))throw Error('Invalid chain response');return h.slice(2).match(/.{64}/g).map(w=>BigInt('0x'+w));};
const call=async(to,data,block)=>words(await rpc('eth_call',[{to,data},block]));
async function valuation(currencies,amounts,block){
 const components=await Promise.all(currencies.map(async(currency,i)=>{
  const decimals=currency==='0x'+'0'.repeat(40)?18:Number((await call(currency,'0x313ce567',block))[0]);if(decimals>36)throw Error('Invalid decimals');
  const price=await tokenPrice(currency).catch(()=>null);
  return {currency,decimals,amountRaw:String(amounts[i]),feesRaw:null,priceUsd:price?.usd??null,priceAt:price?.at??null};
 }));
 const priced=components.every(c=>c.amountRaw==='0'||c.priceUsd!==null);
 const value=priced?components.reduce((s,c)=>s+Number(c.amountRaw)/10**c.decimals*(c.priceUsd||0),0):null;
 if(value!==null&&!Number.isFinite(value))throw Error('Invalid value');
 return {value,components,estimated:true,valuationPartial:!priced,feesExcluded:true,feesIncluded:false,at:Date.now(),block,valuationSource:'Current on-chain liquidity amounts · DexScreener prices'};
}
export async function fablesPositions(wallet){
 const indexed=[];let complete=false;
 for(let off=0;off<5000;off+=1000){const d=await json('https://www.fables.fi/api/indexer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'owner',address:wallet,off:String(off)})});if(!Array.isArray(d.data?.Position))throw Error('Invalid Fables positions');indexed.push(...d.data.Position.filter(p=>positive(p.liquidity)));if(d.data.Position.length<1000){complete=true;break;}}
 const block=await rpc('eth_blockNumber',[]);
 const results=await settledMap(indexed,async p=>{
  const base={id:'fables:'+p.pool_id+':'+p.range_id,protocol:'Fables',poolId:p.pool_id,side:'Liquidity',name:'Liquidity range '+p.range_id.slice(0,10),value:null,valuationPartial:true};
  try{
   const registry=fablesRegistry[p.pool_id];if(!registry)throw Error('Unknown hook');
   const data=selector('userRanges(address,address,uint256[])')+word(registry.hook)+word(wallet)+word(96)+word(1)+word(p.range_id);
   const w=await call('0xe44c0bab43bdd47e7ab40236bc183dcc77a9ed6c',data,block),offset=Number(w[0]/32n);
   if(w[offset]!==1n)throw Error('Missing range');const r=w.slice(offset+1,offset+28);
   if(r.length!==27||r[0]!==BigInt(p.range_id)||r[1]!==1n||address(r[6])!==registry.hook)throw Error('Unverified range');
   if(r[9]===0n&&r[10]===0n)return null;
   const poolHash=keccak256('0x'+r.slice(2,7).map(word).join(''));if(poolHash!==p.pool_id)throw Error('Pool mismatch');
   return {...base,name:registry.slug.toUpperCase()+' liquidity',balanceRaw:String(r[9]),stakedRaw:String(r[10]),inRange:r[20]===1n,...await valuation(r.slice(2,4).map(address),r.slice(25,27),block)};
  }catch{return base;}
 });
 const items=results.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value);
 return {items,partial:!complete||results.some(r=>r.status==='rejected')||items.some(p=>p.valuationPartial),block,scope:'Indexed ranges verified through Fables on-chain lens; principal valued in USD, unclaimed fees and rewards excluded'};
}
export function parseRamsesTick(value,pool){const prefix=pool+":";if(typeof value!=="string"||!value.startsWith(prefix)||!/^[-]?\d+$/.test(value.slice(prefix.length)))throw Error("Invalid Ramses tick reference");return Number(value.slice(prefix.length));}
export async function ramsesPositions(wallet,markets=[]){
 const items=[];let complete=false;const block=await rpc('eth_blockNumber',[]);
 for(let offset=0;offset<500;offset+=100){
  const query='query($owner:String!,$offset:Int!){ClPosition(where:{chainId:{_eq:4663},owner:{_eq:$owner}},order_by:{id:asc},limit:100,offset:$offset){id owner chainId pool liquidity tickLower tickUpper}}';
  const d=await json('https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,variables:{owner:wallet,offset}})});if(!Array.isArray(d.data?.ClPosition))throw Error('Invalid Ramses positions');
  const rows=await settledMap(d.data.ClPosition.filter(p=>p.chainId===4663&&p.owner.toLowerCase()===wallet&&positive(p.liquidity)),async p=>{
   const pool=addr(p.pool.replace(/^4663:/,'')),base={id:'ramses:cl:'+p.id,protocol:'Ramses',contract:pool,side:'Liquidity',name:markets.find(m=>m.contract===pool)?.name||'Concentrated liquidity',liquidityRaw:p.liquidity,value:null,valuationPartial:true};
   try{if(!pool)throw Error('Invalid pool');const [slot,t0,t1]=await Promise.all([call(pool,'0x3850c7bd',block),call(pool,'0x0dfe1681',block),call(pool,'0xd21220a7',block)]);
    const currencies=[address(t0[0]),address(t1[0])],lower=parseRamsesTick(p.tickLower,p.pool),upper=parseRamsesTick(p.tickUpper,p.pool),tick=Number(BigInt.asIntN(24,slot[1]));
    const amounts=liquidityAmounts(BigInt(p.liquidity),slot[0],lower,upper);
    return {...base,inRange:tick>=lower&&tick<upper,...await valuation(currencies,amounts,block),valuationSource:"Indexed position liquidity · current on-chain pool state · DexScreener prices"};
   }catch{return base;}
  });items.push(...rows.filter(r=>r.status==='fulfilled').map(r=>r.value));if(d.data.ClPosition.length<100){complete=true;break;}
 }
 return {items,partial:!complete||items.some(p=>p.valuationPartial),block};
}
