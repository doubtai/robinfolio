import {allCatalogs,protocols,protocolCatalog} from '../lib/protocol-markets.js';
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const id=String(req.query?.protocol||'');if(id&&!protocols.some(p=>p.id===id))return res.status(400).json({error:'Unknown protocol'});
 const data=id?[await protocolCatalog(id).then(d=>({...protocols.find(p=>p.id===id),status:'available',...d})).catch(()=>({...protocols.find(p=>p.id===id),status:'unavailable',markets:[]}))]:await allCatalogs();
 res.setHeader('Cache-Control','s-maxage=180');
 res.status(200).json({chainId:4663,protocols:data,scope:'Market discovery, independent of wallet holdings. Rates are variable; missing values are not zero.',recommendationsEnabled:false});
}

