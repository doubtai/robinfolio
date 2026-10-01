import {expandedPositions} from '../lib/expanded-positions.js';
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const address=String(req.query?.address||'').toLowerCase();if(!/^0x[0-9a-f]{40}$/.test(address))return res.status(400).json({error:'Invalid address'});
 try{const data=await expandedPositions(address);res.setHeader('Cache-Control','s-maxage=30');return res.status(200).json({address,chainId:4663,...data});}catch{return res.status(502).json({error:'Additional protocol positions are unavailable'});}
}

