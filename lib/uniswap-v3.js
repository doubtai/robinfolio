import {rpc,settledMap} from './protocol-utils.js';
import {liquidityAmounts,accruedFee,tokenPrice} from './v4-valuation.js';

// Official Robinhood deployment, also used by Delta's V3 manager.
// https://docs.uniswap.org/contracts/v3/reference/deployments/robinhood-deployments
export const POSITION_MANAGER='0x73991a25c818bf1f1128deaab1492d45638de0d3';
const FACTORY='0x1f7d7550b1b028f7571e69a784071f0205fd2efa';
const word=n=>BigInt.asUintN(256,BigInt(n)).toString(16).padStart(64,'0');
const address=n=>'0x'+word(n).slice(-40);
function words(h,n){if(!new RegExp('^0x[0-9a-f]{'+n*64+'}$','i').test(h))throw Error('Invalid V3 response');return h.slice(2).match(/.{64}/g).map(w=>BigInt('0x'+w));}
function decodeSymbol(h,fallback){try{const data=h.slice(2);if(data.length===64)return Buffer.from(data,'hex').toString('utf8').replace(/\0+$/,'').slice(0,40)||fallback;const offset=Number(BigInt('0x'+data.slice(0,64)))*2,size=Number(BigInt('0x'+data.slice(offset,offset+64)));if(size>80||offset+64+size*2>data.length)throw Error();return Buffer.from(data.slice(offset+64,offset+64+size*2),'hex').toString('utf8').slice(0,40)||fallback;}catch{return fallback;}}
export async function uniswapV3Positions(wallet){
 const block=await rpc('eth_blockNumber',[]),cache=new Map();
 const call=(to,data)=>{const k=to+data;if(!cache.has(k))cache.set(k,rpc('eth_call',[{to,data},block]));return cache.get(k);};
 const read=async(to,data,n)=>words(await call(to,data),n);
 const count=(await read(POSITION_MANAGER,'0x70a08231'+word(wallet),1))[0];
 if(count===0n)return {items:[],partial:false,block,scope:'Uniswap V3 wallet-owned NFTs verified on-chain'};
 const rows=await settledMap(Array.from({length:Number(count>80n?80n:count)},(_,i)=>i),async index=>{
  const id=(await read(POSITION_MANAGER,'0x2f745c59'+word(wallet)+word(index),1))[0],encoded=word(id);
  const owner=address((await read(POSITION_MANAGER,'0x6352211e'+encoded,1))[0]);if(owner!==wallet)return null;
  const state=await read(POSITION_MANAGER,'0x99fbab88'+encoded,12),liquidity=state[7];
  if(liquidity===0n&&state[10]===0n&&state[11]===0n)return null;
  const currencies=state.slice(2,4).map(address),lower=Number(BigInt.asIntN(24,state[5])),upper=Number(BigInt.asIntN(24,state[6]));
  const pool=address((await read(FACTORY,'0x1698ee82'+word(state[2])+word(state[3])+word(state[4]),1))[0]);
  const [slot,meta,prices]=await Promise.all([
   read(pool,'0x3850c7bd',7),Promise.all(currencies.map(async c=>{const [d,s]=await Promise.all([read(c,'0x313ce567',1),call(c,'0x95d89b41').catch(()=>null)]);if(d[0]>36n)throw Error('Invalid decimals');return {decimals:Number(d[0]),symbol:s?decodeSymbol(s,c.slice(0,8)):c.slice(0,8)};})),
   Promise.all(currencies.map(c=>tokenPrice(c).catch(()=>null)))
  ]);
  const tick=Number(BigInt.asIntN(24,slot[1])),amounts=liquidityAmounts(liquidity,slot[0],lower,upper);let fees=null;
  try{
   if(liquidity===0n)fees=state.slice(10,12);
   else {
    const [global0,global1,low,high]=await Promise.all([read(pool,'0xf3058399',1),read(pool,'0x46141319',1),read(pool,'0xf30dba93'+word(lower),8),read(pool,'0xf30dba93'+word(upper),8)]);
    const mod=1n<<256n,wrap=n=>(n%mod+mod)%mod;
    fees=[global0[0],global1[0]].map((global,i)=>{
     const below=tick>=lower?low[2+i]:wrap(global-low[2+i]),above=tick<upper?high[2+i]:wrap(global-high[2+i]);
     return state[10+i]+accruedFee(wrap(global-below-above),state[8+i],liquidity);
    });
   }
  }catch{/* Keep verified principal when the fee read fails. */}
  const priced=amounts.every((n,i)=>n+(fees?.[i]||0n)===0n||prices[i]!==null);
  const sum=raw=>raw.reduce((total,n,i)=>total+(n===0n?0:Number(n)/10**meta[i].decimals*prices[i].usd),0);
  const principalValue=priced?sum(amounts):null,feesValue=priced&&fees?sum(fees):null,value=principalValue===null?null:principalValue+(feesValue||0);
  if(value!==null&&!Number.isFinite(value))throw Error('Invalid V3 value');
  return {id:'uniswap:v3:'+id,contract:POSITION_MANAGER,tokenId:String(id),protocol:'Uniswap V3',name:meta.map(m=>m.symbol).join(' / '),side:'Liquidity',
   value,principalValue,feesValue,feesIncluded:fees!==null,estimated:true,valuationPartial:!priced||fees===null,valuationSource:'On-chain amounts · DexScreener prices',
   components:currencies.map((currency,i)=>({currency,decimals:meta[i].decimals,amountRaw:String(amounts[i]),feesRaw:fees?String(fees[i]):null,priceUsd:prices[i]?.usd??null,priceAt:prices[i]?.at??null})),
   inRange:tick>=lower&&tick<upper,liquidityRaw:String(liquidity),block,at:Date.now()};
 });
 const items=rows.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value);
 return {items,partial:count>80n||rows.some(r=>r.status==='rejected')||items.some(p=>p.valuationPartial),block,scope:'Uniswap V3 wallet-owned NFTs read at one block; estimated USD includes accrued fees when available. Manager-held NFTs are read by their protocol adapters'};
}
