const CHAIN={id:'0x1237',decimal:4663,name:'Robinhood Chain',rpc:'https://rpc.mainnet.chain.robinhood.com',explorer:'https://robin.etherscan.io',symbol:'ETH'};
const $=selector=>document.querySelector(selector), esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let account='',view=(location.hash||'#overview').slice(1),liveData=null;
const short=value=>value?value.slice(0,6)+'…'+value.slice(-4):'';
function placeholder(){const copy={assets:['Assets','Inspect every token and current balance held by this wallet.'],markets:['Tokenized Markets','Follow tokenized equities, ETFs and other real-world assets on Robinhood Chain.'],defi:['DeFi positions','Track Uniswap liquidity, Morpho lending and the next protocols joining the network.'],swap:['Swap','Compare executable routes across Robinhood Chain liquidity.'],activity:['Activity','Reconcile transfers, swaps, bridge movements and contract interactions.'],nfts:['NFTs','Review ERC-721 and ERC-1155 assets verified against current ownership.'],wallets:['Wallets','Connect or track multiple public Robinhood Chain addresses.']}[view]||['Robinfolio','Portfolio intelligence for tokenized markets.'];return `<section class="page"><div class="page-head"><div><h1>${copy[0]}</h1><p>${copy[1]}</p></div></div><div class="glass empty-view"><div><h2>${copy[0]} is ready for live integration.</h2><p>Its layout and Robinhood Chain data model are in place. Connect a wallet to verify the network and begin reading live balances.</p></div></div></section>`}
let loadError='',requestVersion=0,loadingAccount=false;
let holdings={tokens:null,nfts:null},holdingsLoading={tokens:false,nfts:false},holdingsErrors={tokens:'',nfts:''};
function nativeUnits(raw){const value=BigInt(raw).toString().padStart(19,'0');return value.slice(0,-18)+(value.slice(-18).replace(/0+$/,'')?'.'+value.slice(-18).replace(/0+$/,''):'');}
function holdingsPanel(kind){
  const data=holdings[kind],nft=kind==='nfts';
  const note=holdingsLoading[kind]?'Scanning wallet assets… '+(data?.pages||0)+' pages checked.':holdingsErrors[kind]||(data?.partial?'Scan finished. Some asset details could not be read.':data?'Scan finished. Current holdings reported by Alchemy.':'Open this section to load current holdings.');
  const items=[...(data?.items||[])];
  if(!nft){
    items.sort((a,b)=>Number(Boolean(b.verifiedOrigin))-Number(Boolean(a.verifiedOrigin))||a.symbol.localeCompare(b.symbol)||a.contract.localeCompare(b.contract));
    if(liveData?.nativeBalanceRaw!=null)items.unshift({native:true,name:'Ether',symbol:'ETH',balance:nativeUnits(liveData.nativeBalanceRaw),verifiedOrigin:'Native asset'});
  }
  let lastGroup='';
  const rows=items.map(item=>{
    const group=nft?'':item.verifiedOrigin?'Verified origin':'Other tokens';
    const heading=group&&group!==lastGroup?'<tr><th colspan="3">'+group+'</th></tr>':'';lastGroup=group;
    return heading+'<tr><td><b>'+esc(nft?item.name:item.symbol)+'</b><br><small class="subtle">'+esc(nft?item.type:item.name)+'</small>'+(item.verifiedOrigin?'<br><small class="up">'+esc(item.verifiedOrigin)+'</small>':'')+'</td><td>'+esc(nft?'#'+item.tokenId:item.balance??'Decimals unavailable')+'</td><td>'+(item.native?'Native ETH':'<a class="card-link" href="'+CHAIN.explorer+'/token/'+encodeURIComponent(item.contract)+'" target="_blank" rel="noopener noreferrer">'+esc(short(item.contract))+'</a>')+'</td>'+(nft?'<td>'+esc(item.balance)+'</td>':'')+'</tr>';
  }).join('');
  return '<article class="glass assets-card"><div class="card-head"><h2>'+(nft?'NFTs':'Token balances')+'</h2></div><p class="subtle" role="status">'+esc(note)+'</p><table class="data-table"><thead><tr><th>Asset</th><th>'+(nft?'Token ID':'Balance')+'</th><th>Contract</th>'+(nft?'<th>Quantity</th>':'')+'</tr></thead><tbody>'+(rows||'<tr><td colspan="4">'+(holdingsLoading[kind]?'Searching all pages for positive balances…':data&&!holdingsErrors[kind]?'No holdings reported by the indexer.':'No asset data loaded.')+'</td></tr>')+'</tbody></table>'+(!holdingsLoading[kind]&&holdingsErrors[kind]?'<button class="connect" data-holdings="'+kind+'">Resume scan</button>':'')+'<p class="subtle">'+(nft?'Ownership is reported by the indexer.':'All discovered positive balances are shown in token units. Verified origin identifies a known issuer or launch platform, not token safety. Other tokens remain visible. USD prices are not connected yet.')+'</p></article>';
}
async function loadHoldings(kind,more=false){
  if(!account||holdingsLoading[kind])return;
  const address=account,version=requestVersion;
  let pageKey=more?holdings[kind]?.nextPageKey:null;
  const seen=new Set(more?holdings[kind]?.cursors||[]:[]);
  holdingsLoading[kind]=true;holdingsErrors[kind]='';render();
  try{
    do{
      if(seen.has(pageKey||''))throw new Error('Repeated pagination cursor');
      const query=new URLSearchParams({address,kind,...(pageKey?{pageKey}:{})});
      const result=await fetch('/api/holdings?'+query,{signal:AbortSignal.timeout(55000)});
      if(!result.ok)throw new Error('unavailable');
      const data=await result.json();
      if(account!==address||version!==requestVersion)return;
      if(!Array.isArray(data.items))throw new Error('invalid response');
      seen.add(pageKey||'');
      const previous=more||seen.size>1?holdings[kind]:null;
      const unique=new Map([...(previous?.items||[]),...data.items].map(item=>[item.contract.toLowerCase()+':'+(item.tokenId||''),item]));
      holdings[kind]={...data,items:[...unique.values()],pages:(previous?.pages||0)+1,cursors:[...seen],partial:Boolean(data.partial||previous?.partial)};
      pageKey=data.nextPageKey;render();
    }while(pageKey);
  }catch{if(account===address&&version===requestVersion)holdingsErrors[kind]='Scan incomplete. Your loaded balances are preserved. Resume to try again.';}
  finally{if(account===address&&version===requestVersion){holdingsLoading[kind]=false;render();}}
}
let historyData=null,historyLoading=false,historyError='',historyPeriod='1month',historyRequest=0;
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
function historyChart(){
  const points=account?historyData?.points||[]:[];
  if(!points.length)return '<div class="chart-empty" role="status">'+esc(!account?'Connect or track a wallet to view its history.':historyLoading?'Loading portfolio history…':historyError||'No historical values available for this period.')+'</div>';
  const min=Math.min(...points.map(p=>p.value)),max=Math.max(...points.map(p=>p.value));
  const first=points[0].at,last=points.at(-1).at,span=last-first;
  const coords=points.map(p=>[(span?(p.at-first)/span:0.5)*850+25,150-(max===min?0.5:(p.value-min)/(max-min))*130]);
  const line=coords.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' ');
  return '<svg class="performance-chart" viewBox="0 0 900 180" role="img" aria-label="Indexed portfolio value in USD"><title>'+esc(points.length+' observations from '+new Date(first).toLocaleDateString()+' to '+new Date(last).toLocaleDateString())+'</title>'+(points.length>1?'<path d="'+line+'" fill="none" stroke="#7fe39a" stroke-width="2.5"/>':'')+coords.map(([x,y],i)=>'<circle cx="'+x+'" cy="'+y+'" r="3" fill="#7fe39a"><title>'+esc(new Date(points[i].at).toLocaleString()+' · '+money(points[i].value))+'</title></circle>').join('')+'</svg><div class="chart-axis"><span>'+esc(new Date(first).toLocaleDateString())+'</span><span>'+esc(money(min)+' – '+money(max))+'</span><span>'+esc(new Date(last).toLocaleDateString())+'</span></div>';
}
async function loadHistory(period=historyPeriod){
  if(!account)return;
  const address=account,version=requestVersion,request=++historyRequest;
  historyPeriod=period;historyLoading=true;historyError='';historyData=null;render();
  try{
    const response=await fetch('/api/history?'+new URLSearchParams({address,period}),{signal:AbortSignal.timeout(25000)});
    const data=await response.json();
    if(account!==address||version!==requestVersion||request!==historyRequest)return;
    if(!response.ok)throw new Error(data.code==='HISTORY_NOT_CONFIGURED'?'Portfolio history is not connected yet.':'Portfolio history is temporarily unavailable.');
    if(!Array.isArray(data.points))throw new Error('Portfolio history is temporarily unavailable.');
    historyData=data;
  }catch(error){if(account===address&&version===requestVersion&&request===historyRequest)historyError=error.name==='TimeoutError'?'Portfolio history timed out. Please retry.':error.message;}
  finally{if(account===address&&version===requestVersion&&request===historyRequest){historyLoading=false;render();}}
}
function liveOverview(){
  const points=account?historyData?.points||[]:[],latest=points.at(-1);
  const periods=[['1day','1D'],['1week','1W'],['1month','1M']].map(([value,label])=>'<button data-period="'+value+'" class="'+(historyPeriod===value?'active':'')+'" '+(!account?'disabled':'')+'>'+label+'</button>').join('');
  const balances=account?holdingsPanel('tokens'):'<article class="glass assets-card"><div class="card-head"><h2>Token balances</h2></div><table class="data-table"><thead><tr><th>ASSET</th><th>BALANCE</th><th>CONTRACT</th></tr></thead></table><div class="dashboard-empty">Connect a wallet or enter its public address to see your assets.</div></article>';
  return '<section class="page"><div class="page-head"><div><h1>Portfolio overview</h1><p>Tokenized equities, ETFs, crypto, stablecoins and DeFi on Robinhood Chain.</p></div><span class="wallet-context">'+esc(account?'Wallet '+short(account):'Connect a wallet for live data')+'</span></div><div class="dashboard-grid"><article class="glass performance"><div class="card-head"><h2>Portfolio value</h2><div class="chart-periods">'+periods+'</div></div><div class="value">'+(latest?esc(money(latest.value)):'—')+'</div><div class="subtle">'+(latest?'Latest indexed value · '+esc(new Date(latest.at).toLocaleString()):'Historical valuation in USD')+'</div>'+historyChart()+(account&&historyError?'<button class="card-link history-retry">Retry history</button>':'')+(latest?'<p class="subtle">1inch indexed coverage. May exclude unsupported assets and positions.'+(historyData.partial?' Some observations were unavailable.':'')+'</p>':'')+'</article><article class="glass allocation"><div class="card-head"><h2>Asset allocation</h2></div><div class="allocation-wrap"><div class="mini-donut"><span><b>—</b><small>No valuation yet</small></span></div><p class="subtle">'+(account?'Allocation will appear when asset valuations are available.':'Connect a wallet to view your allocation.')+'</p></div></article>'+balances+'<div class="defi-column"><article class="glass compact-card"><div class="card-head"><h2>DeFi positions</h2><a class="card-link" href="#defi">View all →</a></div><div class="dashboard-empty">'+(account?'Position data is not connected yet.':'Connect a wallet to view your positions.')+'</div></article><article class="glass compact-card"><div class="card-head"><h2>Market insight</h2></div><div class="dashboard-empty">'+(account?'Insights will appear once balances, prices and positions are available.':'Your portfolio insights will appear here.')+'</div></article></div></div></section>';
}
function liveActivity(){
  const source=liveData?.sources?.transactions;
  const rows=(liveData?.transactions||[]).filter(tx=>/^0x[0-9a-f]{64}$/i.test(tx.hash||'')).map(tx=>`<tr><td><a class="card-link" href="${CHAIN.explorer}/tx/${tx.hash}" target="_blank" rel="noopener noreferrer">${esc(short(tx.hash))}</a></td><td>${esc(short(tx.from))}</td><td>${esc(short(tx.to))}</td><td>${tx.isError==='1'?'Failed':'Confirmed'}</td></tr>`).join('');
  return `<section class="page"><div class="page-head"><div><h1>Activity</h1><p>${source?.status==='available'?(source.truncated?'Latest 100 transactions. Earlier history is not loaded.':'Indexed transactions for this wallet.'):'Transaction history is currently unavailable.'}</p></div></div><article class="glass assets-card"><table class="data-table"><thead><tr><th>Transaction</th><th>From</th><th>To</th><th>Status</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No transactions to display.</td></tr>'}</tbody></table></article></section>`;
}
function render(){document.querySelectorAll('#app-nav a').forEach(link=>link.classList.toggle('active',link.dataset.view===view));$('#main-content').innerHTML=view==='overview'?liveOverview():(view==='activity'&&account?liveActivity():account&&['assets','nfts'].includes(view)?`<section class="page">${holdingsPanel(view==='nfts'?'nfts':'tokens')}</section>`:placeholder());document.querySelectorAll('[data-holdings]').forEach(button=>button.addEventListener('click',()=>loadHoldings(button.dataset.holdings,Boolean(holdings[button.dataset.holdings]?.nextPageKey))));document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>loadHistory(button.dataset.period)));document.querySelectorAll('.history-retry').forEach(button=>button.addEventListener('click',()=>loadHistory()));}
async function switchChain(){const provider=window.ethereum;if(!provider)throw new Error('Install an EVM wallet to connect.');try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN.id}]})}catch(error){if(error.code!==4902)throw error;await provider.request({method:'wallet_addEthereumChain',params:[{chainId:CHAIN.id,chainName:CHAIN.name,nativeCurrency:{name:'Ether',symbol:CHAIN.symbol,decimals:18},rpcUrls:[CHAIN.rpc],blockExplorerUrls:[CHAIN.explorer]}]})}}
async function loadAccount(address){const version=++requestVersion;holdings={tokens:null,nfts:null};holdingsLoading={tokens:false,nfts:false};holdingsErrors={tokens:'',nfts:''};liveData=null;historyData=null;historyError='';historyLoading=false;loadError='';loadingAccount=true;render();loadHistory();loadHoldings(view==='nfts'?'nfts':'tokens');try{const response=await fetch('/api/portfolio?address='+encodeURIComponent(address),{signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error('Wallet data is temporarily unavailable.');const data=await response.json();if(version!==requestVersion||account!==address)return;liveData=data;}catch{if(version===requestVersion&&account===address)loadError='Wallet data is temporarily unavailable. Try again.';}finally{if(version===requestVersion){loadingAccount=false;render();}}}
$('#connect-wallet').addEventListener('click',async()=>{try{await switchChain();const [address]=await window.ethereum.request({method:'eth_requestAccounts'});account=address;$('#connect-wallet').textContent=short(account);await loadAccount(account)}catch(error){$('#connect-wallet').textContent=error.message.slice(0,34)}});
$('#address-input').addEventListener('keydown',event=>{if(event.key!=='Enter')return;const value=event.currentTarget.value.trim();if(/^0x[a-fA-F0-9]{40}$/.test(value)){account=value;loadAccount(value)}});
window.addEventListener('hashchange',()=>{view=(location.hash||'#overview').slice(1);render();const kind=view==='nfts'?'nfts':'tokens';if(account&&['overview','assets','nfts'].includes(view)&&!holdings[kind]&&!holdingsErrors[kind])loadHoldings(kind)});
if(window.ethereum)window.ethereum.on?.('accountsChanged',accounts=>{account=accounts[0]||'';liveData=null;account?loadAccount(account):render()});
render();

