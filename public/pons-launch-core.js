import {Interface, getAddress, hexlify, randomBytes} from './launch-ethers.js';
export const FACTORY='0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e';
export const USDG='0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
export const CHAIN_ID=4663;
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
 const url=(name,ipfs=false)=>{const value=field(name,500);let parsed;try{parsed=new URL(value);}catch{throw Error('Enter a complete URL for '+name+'.');}if(parsed.protocol!=='https:'&&!(ipfs&&parsed.protocol==='ipfs:'))throw Error(name+' must use HTTPS'+(ipfs?' or IPFS.':'.'));return value;};
 const values={name:field('name',64),symbol:field('symbol',16),description:field('description',1000),logo:url('logo',true),website:url('website'),twitter:url('twitter')};
 if(!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(new URL(values.twitter).hostname))throw Error('Use an X / Twitter profile URL.');
 return values;
}
export async function readTerms(rpc,account){
 const block=await rpc('eth_blockNumber',[]);
 const chain=await rpc('eth_chainId',[]);if(Number(chain)!==CHAIN_ID)throw Error('Switch to Robinhood Chain.');
 const code=await rpc('eth_getCode',[FACTORY,block]);if(code==='0x')throw Error('Pons factory is unavailable on this network.');
 const read=async(fn,args=[])=>abi.decodeFunctionResult(fn,await rpc('eth_call',[{to:FACTORY,data:abi.encodeFunctionData(fn,args)},block]));
 const [count,fee,max,approved,economics,allowed]=await Promise.all([read('launchConfigCount'),read('launchFee'),read('maxCreatorTaxBps'),read('approvedPairTokens',[USDG]),read('pairTokenEconomics',[USDG]),read('canLaunch',[account])]);
 if(!allowed[0])throw Error('This wallet cannot launch on the current Pons factory.');
 if(!approved[0]||economics[0]===0n||economics[1]===0n)throw Error('USDG launches are not enabled by Pons.');
 if(max[0]<200n)throw Error('Pons currently does not allow a 2% creator tax.');
 if(count[0]>100n)throw Error('Unexpected Pons configuration count.');
 const configs=(await Promise.all(Array.from({length:Number(count[0])},async(_,id)=>({id,config:(await read('getLaunchConfig',[id]))[0]})))).filter(c=>c.config.enabled);
 if(!configs.length)throw Error('No enabled launch configuration.');
 return {fee:fee[0],configs,decimals:Number(economics[2]),threshold:economics[1],read};
}
export async function prepareLaunch(rpc,account,raw,configId){
 const fields=validateFields(raw),terms=await readTerms(rpc,account),selected=terms.configs.find(c=>c.id===Number(configId));
 if(!selected)throw Error('This launch configuration is no longer available.');
 const pin=(await terms.read('previewLaunchEconomics',[selected.id,USDG]))[0];
 const params={...fields,socials:{twitter:fields.twitter,telegram:'',discord:'',website:fields.website,farcaster:''},creatorFeeRecipient:getAddress(account),creatorTaxBps:200,buybackEnabled:false,expectedEconomics:pin,salt:hexlify(randomBytes(32))};
 const tx={from:getAddress(account),to:FACTORY,value:'0x'+terms.fee.toString(16),data:abi.encodeFunctionData('launchToken',[params,selected.id,USDG])};
 // Simulate the exact unsigned transaction. No key or signature is involved.
 const result=abi.decodeFunctionResult('launchToken',await rpc('eth_call',[tx,'latest']));
 const gas=await rpc('eth_estimateGas',[tx]);
 return {tx,fields,terms,config:selected.config,configId:selected.id,pin,token:result[0],curve:result[1],gas,account:getAddress(account),createdAt:Date.now()};
}
