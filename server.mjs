import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT || 8768);
const station = {site:'VIC-WESTERN-PORT',lat:-38.2657,lon:145.2745,depth:0.7,unit:'FNU'};
const api = 'https://imoslive.aodn.org.au/api/v1/ogc/collections/dummy_collection_id_satisfying_api/items';
let cache = null;

async function json(url){
  const response = await fetch(url,{signal:AbortSignal.timeout(25000),headers:{accept:'application/json'}});
  if(!response.ok)throw new Error(`Upstream HTTP ${response.status}`);
  return response.json();
}
async function turbidity(){
  if(cache && Date.now()-cache.at<5*60*1000)return cache.value;
  const end = new Date(), start = new Date(end.getTime()-19*86400000);
  const day = d => new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  const interval = `${start.toISOString()}/${end.toISOString()}`;
  const aodnUrl = new URL(`${api}/mooring_estuarine_water_quality_details_between_dates`,'https://imoslive.aodn.org.au');
  aodnUrl.search = new URLSearchParams({mooring:station.site,datetime:interval});
  const weatherUrl = new URL('https://archive-api.open-meteo.com/v1/archive');
  weatherUrl.search = new URLSearchParams({
    latitude:station.lat,longitude:station.lon,start_date:day(start),end_date:day(end),
    hourly:'wind_speed_10m,precipitation',wind_speed_unit:'ms',
    timezone:'Australia/Melbourne',timeformat:'unixtime'
  });
  const [record,weather] = await Promise.all([json(aodnUrl),json(weatherUrl)]);
  const values=[];
  for(const instrument of Object.values(record.properties||{})){
    if(!instrument||typeof instrument!=='object')continue;
    for(const depth of Object.values(instrument)){
      for(const pair of Array.isArray(depth?.TURB)?depth.TURB:[]){
        const [ms,value]=pair;
        if(Number.isFinite(ms)&&Number.isFinite(value)&&value>=0&&value<=4000)values.push([Math.floor(ms/1000),value]);
      }
    }
  }
  values.sort((a,b)=>a[0]-b[0]);
  const latest=values.at(-1);
  if(!latest)throw new Error('No valid IMOS turbidity observations');
  const value={station,latest:{time:latest[0],value:latest[1]},history:values,weather:weather.hourly,retrievedAt:new Date().toISOString()};
  cache={at:Date.now(),value};
  return value;
}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
function send(res,status,body,type='application/json; charset=utf-8'){
  res.writeHead(status,{'Content-Type':type,'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store'});
  res.end(body);
}
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method==='OPTIONS')return send(res,204,'');
  if(req.method!=='GET')return send(res,405,JSON.stringify({error:'Method not allowed'}));
  if(url.pathname==='/api/health')return send(res,200,JSON.stringify({ok:true,station:station.site}));
  if(url.pathname==='/api/turbidity'){
    try{return send(res,200,JSON.stringify(await turbidity()));}
    catch(error){return send(res,502,JSON.stringify({error:error.message}));}
  }
  const requested=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
  const file=resolve(root,'.'+requested.replaceAll('/',sep));
  if(file!==root&&!file.startsWith(root+sep))return send(res,403,'Forbidden','text/plain; charset=utf-8');
  try{
    const info=await stat(file);if(!info.isFile())throw new Error('Not a file');
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(body);
  }catch{return send(res,404,'Not found','text/plain; charset=utf-8');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Western Port forecast available at http://127.0.0.1:${port}/`));
