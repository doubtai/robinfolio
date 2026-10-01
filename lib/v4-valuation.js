import TickMath from './tick-math.cjs';
import {keccak256} from '@ethersproject/keccak256';

// Official Robinhood Chain deployment and ABI:
// https://developers.uniswap.org/docs/protocols/v4/deployments
// https://github.com/Uniswap/v4-periphery/blob/main/src/lens/StateView.sol
export const STATE_VIEW='0xf3334192d15450cdd385c8b70e03f9a6bd9e673b';
const PM='0x58daec3116aae6d93017baaea7749052e8a04fa7';
const ZERO='0x'+'0'.repeat(40),WETH='0x0bd7d308f8e1639fab988df18a8011f41eacad73';
const Q96=1n<<96n,Q128=1n<<128n,MOD=1n<<256n;
const word=n=>BigInt.asUintN(256,BigInt(n)).toString(16).padStart(64,'0');
function words(hex,count){if(!new RegExp('^0x[0-9a-f]{'+count*64+'}$','i').test(hex))throw Error('Invalid state response');return hex.slice(2).match(/.{64}/g).map(w=>BigInt('0x'+w));}
export function ticksFromInfo(info){const packed=BigInt(info);return {lower:Number(BigInt.asIntN(24,packed>>8n)),upper:Number(BigInt.asIntN(24,packed>>32n))};}
export function liquidityAmounts(liquidity,sqrtPrice,lower,upper){
 if(!Number.isInteger(lower)||!Number.isInteger(upper)||lower>=upper||lower<-887272||upper>887272||liquidity<0n||sqrtPrice<=0n)throw Error('Invalid liquidity range');
 const a=BigInt(TickMath.getSqrtRatioAtTick(lower).toString()),b=BigInt(TickMath.getSqrtRatioAtTick(upper).toString());
 const p=sqrtPrice<a?a:sqrtPrice>b?b:sqrtPrice;
 return [liquidity*Q96*(b-p)/b/p,liquidity*(p-a)/Q96];
}
export const accruedFee=(current,last,liquidity)=>((current-last+MOD)%MOD)*liquidity/Q128;
const priceCache=new Map();
export async function tokenPrice(currency){
 const contract=currency===ZERO?WETH:currency.toLowerCase(),old=priceCache.get(contract);
 if(old&&old.until>Date.now())return old.promise;
 const promise=(async()=>{
 const response=await fetch('https://api.dexscreener.com/latest/dex/tokens/'+contract,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Price unavailable');
 const body=await response.json();const pairs=(body.pairs||[]).filter(p=>p.chainId==='robinhood'&&Number(p.priceUsd)>0&&Number.isFinite(Number(p.priceUsd))&&Number(p.liquidity?.usd)>=10000).sort((a,b)=>Number(b.liquidity.usd)-Number(a.liquidity.usd));
 const direct=pairs.find(p=>p.baseToken?.address?.toLowerCase()===contract);
 // priceNative is base-token units expressed in the quote token. Never assign
 // the base token's USD price directly to a matching quote token (e.g. USDG).
 const quoted=direct?null:pairs.find(p=>p.quoteToken?.address?.toLowerCase()===contract&&Number(p.priceNative)>0&&Number.isFinite(Number(p.priceNative)));
 const pair=direct||quoted,usd=direct?Number(direct.priceUsd):quoted?Number(quoted.priceUsd)/Number(quoted.priceNative):null;
 if(!pair||!Number.isFinite(usd)||usd<=0)throw Error('No liquid priced market');return {usd,source:direct?'DexScreener':'DexScreener quote conversion',at:Date.now(),pair:pair.pairAddress};
 })();priceCache.set(contract,{promise,until:Date.now()+60000});try{return await promise;}catch(error){priceCache.delete(contract);throw error;}
}
export async function valueV4Position({liquidity,poolWords,tokenId,block,call,price=tokenPrice}){
 const currencies=poolWords.slice(0,2).map(w=>'0x'+w.slice(-40).toLowerCase());
 const {lower,upper}=ticksFromInfo('0x'+poolWords[5]);const poolId=keccak256('0x'+poolWords.slice(0,5).join(''));
 const [slot,decimals]=await Promise.all([
 call(STATE_VIEW,'0xc815641c'+poolId.slice(2),block).then(d=>words(d,4)),
 Promise.all(currencies.map(async currency=>{const n=currency===ZERO?18:Number(words(await call(currency,'0x313ce567',block),1)[0]);if(!Number.isInteger(n)||n<0||n>36)throw Error('Invalid decimals');return n;}))
 ]);
 const amounts=liquidityAmounts(liquidity,slot[0],lower,upper);let fees=null;
 try{
 const args=poolId.slice(2)+word(lower)+word(upper);
 const [inside,state]=await Promise.all([
 call(STATE_VIEW,'0x53e9c1fb'+args,block).then(d=>words(d,2)),
 call(STATE_VIEW,'0xdacf1d2f'+poolId.slice(2)+PM.slice(2).padStart(64,'0')+word(lower)+word(upper)+word(tokenId),block).then(d=>words(d,3))
 ]);
 if(state[0]!==liquidity)throw Error('Liquidity mismatch');
 fees=inside.map((growth,i)=>accruedFee(growth,state[i+1],liquidity));
 }catch{/* Retain principal amounts if the fee read is unavailable. */}
 const prices=await Promise.all(currencies.map(c=>price(c).catch(()=>null)));
 const components=currencies.map((currency,i)=>({currency,decimals:decimals[i],amountRaw:amounts[i].toString(),feesRaw:fees?fees[i].toString():null,priceUsd:prices[i]?.usd??null,priceAt:prices[i]?.at??null}));
 const priced=components.every((c,i)=>(amounts[i]+(fees?.[i]||0n))===0n||c.priceUsd!==null);
 const sum=raw=>raw.reduce((total,n,i)=>total+(n===0n?0:Number(n)/10**decimals[i]*prices[i].usd),0);
 const principalValue=priced?sum(amounts):null,feesValue=priced&&fees?sum(fees):null;
 const value=principalValue===null?null:principalValue+(feesValue||0);
 if(value!==null&&!Number.isFinite(value))throw Error('Invalid USD valuation');
 return {value,principalValue,feesValue,feesIncluded:fees!==null,valuationPartial:!priced||fees===null,estimated:true,valuationSource:'On-chain amounts · DexScreener prices',components,poolId,tickLower:lower,tickUpper:upper,inRange:slot[0]>=BigInt(TickMath.getSqrtRatioAtTick(lower).toString())&&slot[0]<BigInt(TickMath.getSqrtRatioAtTick(upper).toString()),at:Date.now()};
}
