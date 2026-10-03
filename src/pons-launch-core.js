import {Interface, getAddress, hexlify, randomBytes, parseUnits, formatUnits} from 'ethers';
import {PAIR_CANDIDATES} from './launch-pairs.js';
export const NATIVE='0x0000000000000000000000000000000000000000';
export {PAIR_CANDIDATES};
export const FACTORY='0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e';
export const USDG='0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
export const CHAIN_ID=4663;
export const BUY_ROUTER='0xe33E9E479dF8802cb0866d5d05258bEc4cF62948';
export const buyAbi=new Interface(['function launchAndBuy(tuple(string name,string symbol,string logo,string description,tuple(string twitter,string telegram,string discord,string website,string farcaster) socials,address creatorFeeRecipient,uint16 creatorTaxBps,bool buybackEnabled,bytes32 expectedEconomics,bytes32 salt) params,uint256 launchConfigId,address pairToken,uint256 quoteIn,uint256 minTokensOut,address recipient,address[] snipeTaxExemptions) payable returns (address token,address curve,uint256 tokensOut)']);
export const erc20Abi=new Interface(['function balanceOf(address) view returns (uint256)','function allowance(address,address) view returns (uint256)','function approve(address,uint256) returns (bool)']);
export function developerBuyAmount(value,decimals){
 const text=String(value??'0').trim();if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text))throw Error('Enter a valid developer buy amount, or 0 to skip.');
 try{return parseUnits(text,decimals);}catch{throw Error('Developer buy has too many decimal places or is too large.');}
}
export const abi=new Interface([
 'function launchConfigCount() view returns (uint256)',
 'function getLaunchConfig(uint256) view returns (tuple(uint256 supply,uint256 curveFeeBps,uint256 phantomQuote,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,bool enabled))',
 'function approvedPairTokens(address) view returns (bool)',
 'function pairTokenEconomics(address) view returns (uint256 phantomQuote,uint256 graduationThreshold,uint8 decimals)',
 'function canLaunch(address) view returns (bool)',
 'function maxCreatorTaxBps() view returns (uint256)',
 'function launchFee() view returns (uint256)',
 'function previewLaunchEconomics(uint256,address) view returns (bytes32)',
 'function launchToken(tuple(string name,string symbol,string logo,string description,tuple(string twitter,string telegram,string discord,string website,string farcaster) socials,address creatorFeeRecipient,uint16 creatorTaxBps,bool buybackEnabled,bytes32 expectedEconomics,bytes32 salt) params,uint256 launchConfigId,address pairToken) payable returns (address token,address curve)'
]);
export function validateFields(raw){
 const field=(name,max)=>{const value=String(raw[name]||'').trim();if(!value||value.length>max)throw Error('Check '+name+' (1–'+max+' characters).');return value;};
 const url=(name,ipfs=false)=>{if(name!=='logo'&&!String(raw[name]||'').trim())return '';const value=field(name,500);let parsed;try{parsed=new URL(value);}catch{throw Error('Enter a complete URL for '+name+'.');}if(parsed.protocol!=='https:'&&!(ipfs&&parsed.protocol==='ipfs:'))throw Error(name+' must use HTTPS'+(ipfs?' or IPFS.':'.'));if(parsed.username||parsed.password)throw Error('Remove credentials from '+name+'.');return value;};
 const values={name:field('name',64),symbol:field('symbol',16),description:field('description',1000),logo:url('logo',true),website:url('website'),twitter:url('twitter')};
 if(values.twitter&&!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(new URL(values.twitter).hostname))throw Error('Use an X / Twitter profile URL.');
 return values;
}
export function creatorTaxBps(value='2'){
 const text=String(value).trim();if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text))throw Error('Enter a creator tax with up to two decimal places.');
 const [whole,fraction='']=text.split('.'),bps=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(bps)||bps>10000)throw Error('Creator tax must be between 0% and 100%.');return bps;
}
export function pairAsset(address=USDG){const normalized=getAddress(address);const pair=PAIR_CANDIDATES.find(p=>p.address.toLowerCase()===normalized.toLowerCase());if(!pair)throw Error('Choose a supported paired asset.');return pair;}
export async function discoverPairs(read){
 const pairs=[pairAsset(NATIVE)];let failures=0;
 for(let offset=0;offset<PAIR_CANDIDATES.length;offset+=6){await Promise.all(PAIR_CANDIDATES.slice(offset,offset+6).filter(p=>p.address!==NATIVE).map(async p=>{try{const [approved,e]=await Promise.all([read('approvedPairTokens',[p.address]),read('pairTokenEconomics',[p.address])]);if(approved[0]&&e[0]>0n&&e[1]>0n)pairs.push({...p,decimals:Number(e[2]),threshold:e[1]});}catch{failures++;}}));}
 const order=p=>p.symbol==='USDG'?0:p.symbol==='ETH'?1:2;
 return {pairs:pairs.sort((a,b)=>order(a)-order(b)||a.symbol.localeCompare(b.symbol)),failures};
}
export async function readTerms(rpc,account,pairToken=USDG){
 const pair=pairAsset(pairToken);
 const block=await rpc('eth_blockNumber',[]);
 const chain=await rpc('eth_chainId',[]);if(Number(chain)!==CHAIN_ID)throw Error('Switch to Robinhood Chain.');
 const code=await rpc('eth_getCode',[FACTORY,block]);if(code==='0x')throw Error('Pons factory is unavailable on this network.');
 const read=async(fn,args=[])=>abi.decodeFunctionResult(fn,await rpc('eth_call',[{to:FACTORY,data:abi.encodeFunctionData(fn,args)},block]));
 const [count,fee,max,allowed]=await Promise.all([read('launchConfigCount'),read('launchFee'),read('maxCreatorTaxBps'),read('canLaunch',[account])]);
 if(!allowed[0])throw Error('This wallet cannot launch on the current Pons factory.');
 let economics;
 if(pair.address!==NATIVE){const [approved,e]=await Promise.all([read('approvedPairTokens',[pair.address]),read('pairTokenEconomics',[pair.address])]);if(!approved[0]||e[0]===0n||e[1]===0n)throw Error(pair.symbol+' launches are not enabled by Pons.');economics=e;}
 if(count[0]>100n)throw Error('Unexpected Pons configuration count.');
 const configs=(await Promise.all(Array.from({length:Number(count[0])},async(_,id)=>({id,config:(await read('getLaunchConfig',[id]))[0]})))).filter(c=>c.config.enabled);
 if(!configs.length)throw Error('No enabled launch configuration.');
 return {fee:fee[0],configs,maxCreatorTaxBps:Number(max[0]),pair,decimals:economics?Number(economics[2]):18,threshold:economics?economics[1]:configs[0].config.graduationThreshold,read};
}
export async function prepareLaunch(rpc,account,raw,configId){
 const fields=validateFields(raw),pair=pairAsset(raw.pairToken||USDG),taxBps=creatorTaxBps(raw.creatorTax??'2'),terms=await readTerms(rpc,account,pair.address),selected=terms.configs.find(c=>c.id===Number(configId));
 if(taxBps>terms.maxCreatorTaxBps)throw Error('Creator tax exceeds the current Pons limit of '+terms.maxCreatorTaxBps/100+'%.');
 if(!selected)throw Error('This launch configuration is no longer available.');
 const pin=(await terms.read('previewLaunchEconomics',[selected.id,pair.address]))[0];
 const params={...fields,socials:{twitter:fields.twitter,telegram:'',discord:'',website:fields.website,farcaster:''},creatorFeeRecipient:getAddress(account),creatorTaxBps:taxBps,buybackEnabled:false,expectedEconomics:pin,salt:hexlify(randomBytes(32))};
 const buyAmount=developerBuyAmount(raw.developerBuy,terms.decimals);
 if(buyAmount>0n){
  if(await rpc('eth_getCode',[BUY_ROUTER,'latest'])==='0x')throw Error('Pons launch-and-buy router is unavailable.');
  if(pair.address!==NATIVE){
   const readToken=async(fn,args)=>erc20Abi.decodeFunctionResult(fn,await rpc('eth_call',[{to:pair.address,data:erc20Abi.encodeFunctionData(fn,args)},'latest']))[0];
   const [balance,allowance]=await Promise.all([readToken('balanceOf',[account]),readToken('allowance',[account,BUY_ROUTER])]);
   if(balance<buyAmount)throw Error('Insufficient '+pair.symbol+' balance for the developer buy.');
   if(allowance<buyAmount)return {needsApproval:true,decimals:terms.decimals,resetApproval:allowance>0n,pair,buyAmount,account:getAddress(account),approvalTx:{from:getAddress(account),to:pair.address,value:'0x0',data:erc20Abi.encodeFunctionData('approve',[BUY_ROUTER,allowance>0n?0n:buyAmount])}};
  }
  const value=terms.fee+(pair.address===NATIVE?buyAmount:0n);
  if(BigInt(await rpc('eth_getBalance',[account,'latest']))<value)throw Error('Insufficient ETH for the launch fee and developer buy. Keep extra ETH for gas.');
  const args=[params,selected.id,pair.address,buyAmount,0n,getAddress(account),[]];
  const tx={from:getAddress(account),to:BUY_ROUTER,value:'0x'+value.toString(16),data:buyAbi.encodeFunctionData('launchAndBuy',args)};
  const quote=buyAbi.decodeFunctionResult('launchAndBuy',await rpc('eth_call',[tx,'latest']));
  if(quote[2]<=0n)throw Error('The developer buy would receive no tokens.');
  const minTokensOut=quote[2]*99n/100n||1n;args[4]=minTokensOut;tx.data=buyAbi.encodeFunctionData('launchAndBuy',args);
  const result=buyAbi.decodeFunctionResult('launchAndBuy',await rpc('eth_call',[tx,'latest']));
  const gas=await rpc('eth_estimateGas',[tx]);
  return {tx,fields,terms,pair,taxBps,config:selected.config,configId:selected.id,pin,token:result[0],curve:result[1],tokensOut:result[2],minTokensOut,buyAmount,buyFormatted:formatUnits(buyAmount,terms.decimals),gas,account:getAddress(account),createdAt:Date.now()};
 }
 const tx={from:getAddress(account),to:FACTORY,value:'0x'+terms.fee.toString(16),data:abi.encodeFunctionData('launchToken',[params,selected.id,pair.address])};
 // Simulate the exact unsigned transaction. No key or signature is involved.
 const result=abi.decodeFunctionResult('launchToken',await rpc('eth_call',[tx,'latest']));
 const gas=await rpc('eth_estimateGas',[tx]);
 return {tx,fields,terms,pair,taxBps,config:selected.config,configId:selected.id,pin,token:result[0],curve:result[1],buyAmount:0n,buyFormatted:'0',gas,account:getAddress(account),createdAt:Date.now()};
}

