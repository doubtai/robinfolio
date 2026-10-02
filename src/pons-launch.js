import {formatEther,formatUnits,getAddress} from 'ethers';
import {FACTORY,USDG,CHAIN_ID,abi,readTerms,prepareLaunch} from './pons-launch-core.js';
const $=id=>document.getElementById(id),wallets=new Map();let provider=null,account='',prepared=null,pending=null,busy=false,version=0;
const rpc=(method,params=[])=>provider.request({method,params});
const status=text=>{$('status').textContent=text;};
function invalidate(){version++;prepared=null;$('review-panel').hidden=true;$('confirmed').checked=false;$('send').disabled=true;}
function lock(value){busy=value;$('connect').disabled=value;$('review').disabled=value||!account||!!pending;$('send').disabled=value||!prepared||!$('confirmed').checked;$('wallet-choice').disabled=value;}
function errorText(e){if(e?.code===4001||e?.code==='ACTION_REJECTED')return 'You cancelled the wallet request.';return e?.shortMessage||e?.message||'Request failed. Please try again.';}
function addWallet(key,name,p){if(wallets.has(key))return;wallets.set(key,p);const o=document.createElement('option');o.value=key;o.textContent=name;$('wallet-choice').append(o);}
window.addEventListener('eip6963:announceProvider',e=>{if(e.detail?.provider&&e.detail.info)addWallet(e.detail.info.uuid,e.detail.info.name,e.detail.provider);});window.dispatchEvent(new Event('eip6963:requestProvider'));
if(window.ethereum)addWallet('injected','Browser wallet',window.ethereum);
if(!wallets.size)status('Open this page in a browser with a wallet extension, or in your wallet’s browser.');
async function connect(){lock(true);invalidate();try{
 provider=wallets.get($('wallet-choice').value);if(!provider)throw Error('No browser wallet found.');
 const accounts=await rpc('eth_requestAccounts');if(!accounts[0])throw Error('No account selected.');
 if(Number(await rpc('eth_chainId'))!==CHAIN_ID){try{await rpc('wallet_switchEthereumChain',[{chainId:'0x1237'}]);}catch(e){if(e.code!==4902)throw e;await rpc('wallet_addEthereumChain',[{chainId:'0x1237',chainName:'Robinhood Chain',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:['https://rpc.mainnet.chain.robinhood.com'],blockExplorerUrls:['https://robin.etherscan.io']}]);}}
 if(Number(await rpc('eth_chainId'))!==CHAIN_ID)throw Error('Select Robinhood Chain in your wallet.');
 account=getAddress((await rpc('eth_accounts'))[0]);$('account').textContent=account;$('recipient').textContent=account.slice(0,8)+'…'+account.slice(-6);
 status('Reading current Pons launch terms…');const terms=await readTerms(rpc,account);$('config').replaceChildren();for(const c of terms.configs){const o=document.createElement('option');o.value=c.id;o.textContent='Config '+c.id+' · '+Number(formatUnits(c.config.supply,18)).toLocaleString()+' tokens · '+Number(c.config.curveFeeBps)/100+'% protocol fee';$('config').append(o);}$('config').disabled=false;
 status('USDG launch available. Graduation threshold: '+formatUnits(terms.threshold,terms.decimals)+' USDG. Launch fee: '+formatEther(terms.fee)+' ETH + gas.');
 const changed=()=>{invalidate();account='';$('account').textContent='Wallet changed. Connect again to refresh.';$('review').disabled=true;};provider.on?.('accountsChanged',changed);provider.on?.('chainChanged',changed);
 }catch(e){account='';status(errorText(e));}finally{lock(false);}}
function addRow(label,value){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;$('summary').append(dt,dd);}
$('connect').onclick=connect;
$('wallet-choice').onchange=()=>{invalidate();account='';$('review').disabled=true;};
$('launch-form').addEventListener('input',invalidate);
$('launch-form').addEventListener('change',invalidate);
$('launch-form').onsubmit=async e=>{e.preventDefault();if(busy||pending)return;invalidate();const current=version;lock(true);status('Checking fees and simulating the launch…');try{
 const candidate=await prepareLaunch(rpc,account,Object.fromEntries(new FormData(e.target)),$('config').value);if(current!==version)throw Error('Details changed during review. Review again.');
 prepared=candidate;$('summary').replaceChildren();for(const [label,value] of Object.entries({Name:prepared.fields.name,Symbol:prepared.fields.symbol,Description:prepared.fields.description,Image:prepared.fields.logo,Website:prepared.fields.website,Twitter:prepared.fields.twitter,'Paired asset':'USDG · '+USDG,'Creator wallet':account,'Creator tax':'2%','Protocol curve fee':Number(prepared.config.curveFeeBps)/100+'%','Total curve fee':(Number(prepared.config.curveFeeBps)+200)/100+'%','Pool fee after graduation':Number(prepared.config.poolFee)/10000+'%','Launch fee':formatEther(prepared.terms.fee)+' ETH + network gas','Estimated gas units':BigInt(prepared.gas).toString(),'Initial purchase':'0 USDG',Buybacks:'Off',Factory:FACTORY,'Expected token':prepared.token}))addRow(label,value);
 $('review-panel').hidden=false;$('review-panel').scrollIntoView({behavior:'smooth'});status('Simulation passed. Review the details before confirming.');
 }catch(e){invalidate();status(errorText(e));}finally{lock(false);}};
$('confirmed').onchange=()=>{$('send').disabled=busy||!prepared||!$('confirmed').checked;};
function resultLink(parent,url,text){const a=document.createElement('a');a.href=url;a.textContent=text;a.target='_blank';a.rel='noopener noreferrer';parent.replaceChildren(a);}
function showPending(){if(!pending)return;$('result').hidden=false;resultLink($('transaction'),'https://robin.etherscan.io/tx/'+pending.hash,pending.hash);}
$('send').onclick=async()=>{if(busy||!prepared||pending||!$('confirmed').checked)return;const p=prepared;lock(true);try{
 if(Date.now()-p.createdAt>180000)throw Error('Review expired. Review the current terms again.');
 if(Number(await rpc('eth_chainId'))!==CHAIN_ID||getAddress((await rpc('eth_accounts'))[0])!==p.account)throw Error('Wallet or network changed. Review again.');
 const terms=await readTerms(rpc,p.account);if(terms.fee!==p.terms.fee||(await terms.read('previewLaunchEconomics',[p.configId,USDG]))[0]!==p.pin)throw Error('Pons terms changed. Review again.');
 await rpc('eth_call',[p.tx,'latest']);await rpc('eth_estimateGas',[p.tx]);
 if(prepared!==p||getAddress((await rpc('eth_accounts'))[0])!==p.account||Number(await rpc('eth_chainId'))!==CHAIN_ID)throw Error('Details, wallet or network changed. Review again.');
 status('Confirm the launch in your wallet.');
 const hash=await rpc('eth_sendTransaction',[p.tx]);pending={hash,account:p.account,token:p.token};try{localStorage.setItem('robinfolio-pons-pending',JSON.stringify(pending));}catch{}invalidate();showPending();status('Transaction submitted. Check confirmation below.');
 }catch(e){invalidate();status(errorText(e));}finally{lock(false);}};
$('check-tx').onclick=async()=>{if(!provider){status('Connect the submitting wallet to check confirmation.');return;}try{if(Number(await rpc('eth_chainId'))!==CHAIN_ID)throw Error('Switch to Robinhood Chain.');const r=await rpc('eth_getTransactionReceipt',[pending.hash]);if(!r){status('Transaction is still pending.');return;}if(Number(r.status)===1){status('Token launched successfully.');resultLink($('token-result'),'https://www.ponsfamily.com/launchpad/'+pending.token,'Open token on Pons ↗');}else{status('Transaction reverted. No token was launched. Connect again and review to retry.');pending=null;try{localStorage.removeItem('robinfolio-pons-pending');}catch{}}}catch(e){status(errorText(e));}};
try{const saved=JSON.parse(localStorage.getItem('robinfolio-pons-pending'));if(/^0x[0-9a-f]{64}$/i.test(saved?.hash)&&/^0x[0-9a-f]{40}$/i.test(saved?.token)){pending=saved;showPending();status('A previous launch was submitted. Check its confirmation before creating another.');}}catch{}
