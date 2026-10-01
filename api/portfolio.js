const CHAIN_ID='4663';
const PUBLIC_RPC='https://rpc.mainnet.chain.robinhood.com';
const validAddress=value=>/^0x[a-fA-F0-9]{40}$/.test(String(value||''));
async function rpc(method,params){const endpoint=process.env.ALCHEMY_ROBINHOOD_RPC_URL||PUBLIC_RPC;const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const payload=await response.json();if(payload.error)throw new Error(payload.error.message);return payload.result}
async function etherscan(action,address){if(!process.env.ETHERSCAN_API_KEY)return null;const query=new URLSearchParams({chainid:CHAIN_ID,module:'account',action,address,startblock:'0',endblock:'9999999999',sort:'desc',page:'1',offset:'100',apikey:process.env.ETHERSCAN_API_KEY});const response=await fetch('https://api.etherscan.io/v2/api?'+query);const payload=await response.json();return payload.status==='1'&&Array.isArray(payload.result)?payload.result:[]}
const formatEth=hex=>{const value=BigInt(hex||0),whole=value/10n**18n,fraction=(value%10n**18n).toString().padStart(18,'0').slice(0,5).replace(/0+$/,'');return `${whole.toLocaleString('en-US')}${fraction?'.'+fraction:''} ETH`};
export default async function handler(request,response){
  const address=String(request.query?.address||'');if(!validAddress(address))return response.status(400).json({error:'Enter a valid EVM address'});
  try{
    const [balance,transactions,tokenTransfers,nftTransfers]=await Promise.all([rpc('eth_getBalance',[address,'latest']),etherscan('txlist',address),etherscan('tokentx',address),etherscan('tokennfttx',address)]);
    response.setHeader('Cache-Control','s-maxage=12,stale-while-revalidate=30');
    return response.status(200).json({address,nativeBalance:formatEth(balance),nativeBalanceRaw:balance,transactions:transactions||[],tokenTransfers:tokenTransfers||[],nftTransfers:nftTransfers||[],indexed:Boolean(process.env.ETHERSCAN_API_KEY),chainId:Number(CHAIN_ID),explorer:`https://robin.etherscan.io/address/${address}`});
  }catch{return response.status(502).json({error:'Portfolio data is temporarily unavailable'});}
}

