'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const {bounds, land, tides, snapshot} = window.WP_DATA;
  const zone = 'Australia/Melbourne', hour = 3600;
  const [west, south, east, north] = bounds;
  const extent = L.latLngBounds([south, west], [north, east]);
  const initial = {lat: -38.32913, lng: 145.23711};
  const offshore = {lat: -38.6, lng: 145};
  const fields = {
    weather: {wind_speed_10m:'m/s', wind_direction_10m:'°', precipitation:'mm'},
    marine: {swell_wave_height:'m', swell_wave_period:'s', swell_wave_direction:'°'}
  };
  const metrics = {
    wind:['风速','m/s','#087d71',1], swell:['外海涌浪有效波高','m','#3169a9',2],
    tide:['Stony Point 参考潮位','m LAT','#9b601a',2], rain:['小时降雨','mm','#6b559c',1]
  };
  const date = new Intl.DateTimeFormat('zh-CN',{timeZone:zone,month:'numeric',day:'numeric'});
  const clock = new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const stamp = t => date.format(t*1000)+' '+clock.format(t*1000);
  const startHour = () => Math.ceil(Date.now()/3600000)*hour;
  const f = (v,d=1) => Number.isFinite(v)?v.toFixed(d):'—';
  const bearing = v => Number.isFinite(v)?'来自 '+['北','东北','东','东南','南','西南','西','西北'][Math.round(v/45)%8]+' '+v.toFixed(0)+'°':'—';
  const key = p => p.lat.toFixed(5)+','+p.lng.toFixed(5);
  function get(name){
    try {return JSON.parse(localStorage.getItem('wpwater-v1:'+name));} catch {return null;}
  }
  function put(name,value){
    try {localStorage.setItem('wpwater-v1:'+name, JSON.stringify(value));} catch {}
  }
  const remembered = get('point');
  let point = remembered && Number.isFinite(remembered.lat) && Number.isFinite(remembered.lng) && extent.contains(remembered) ? remembered : initial;
  let range = 'week', day = 0, active = 0, metric = 'wind', rows = [], chartX = null;
  let windData, marineData, windBusy = false, marineBusy = false, windError = false, marineError = false;
  let windJob, marineJob, marineFlight;

  const map = L.map('map',{scrollWheelZoom:false, maxBounds:extent.pad(.15), maxBoundsViscosity:1, minZoom:8, maxZoom:15, zoomSnap:.25, attributionControl:false});
  const credit = L.control.attribution({prefix:false}).addTo(map);
  credit.addAttribution('<a href="https://discover.data.vic.gov.au/dataset/vicmap-index-framework-polygon">© State of Victoria / Vicmap · CC BY 4.0</a>');
  map.fitBounds([[-38.55,145.05],[-38.205,145.56]],{padding:[10,9]});
  L.geoJSON(land,{interactive:false,style:{color:'#82a9a5',weight:1,fillColor:'#f5f5e8',fillOpacity:1}}).addTo(map);
  if(!map.getBounds().contains(point))map.panTo(point,{animate:false});
  for(const [label,lat,lng,water,wide] of [
    ['Hastings',-38.306,145.164],['Tyabb Bank',-38.256,145.223,false,true],['Tankerton',-38.373,145.294,false,true],
    ['French Island',-38.329,145.375],['Phillip Island',-38.484,145.205],['Flinders',-38.473,145.035],
    ['Corinella',-38.381,145.464,false,true],['San Remo',-38.534,145.408],['WESTERN PORT',-38.415,145.213,true],
    ['West Entrance',-38.528,145.074,true,true],['East Entrance',-38.562,145.359,true,true]
  ]){
    L.marker([lat,lng],{interactive:false,keyboard:false,icon:L.divIcon({
      className:'map-label'+(water?' water-label':'')+(wide?' zoom-label':''),
      html:label,iconSize:[0,0],iconAnchor:[0,9]
    })}).addTo(map);
  }
  const marker = L.marker(point,{interactive:false,keyboard:false,icon:L.divIcon({className:'pin',iconSize:[15,15]})}).addTo(map);

  function pack(data,type,at){
    const h = data?.hourly, t = h?.time, names = Object.keys(fields[type]);
    if(!Array.isArray(t)||!t.length||!t.every((v,i)=>Number.isInteger(v)&&(!i||v>t[i-1]))||
      names.some(k=>data.hourly_units?.[k]!==fields[type][k]||!Array.isArray(h[k])||h[k].length!==t.length)||
      !h[names[0]].some(Number.isFinite)) return null;
    return {data,at,values:new Map(t.map((v,i)=>[v,names.map(n=>Number.isFinite(h[n][i])?h[n][i]:null)]))};
  }
  function cached(type,p){
    const prev = get(type==='weather'?'weather:'+key(p):'marine');
    const snap = type==='marine'?snapshot?.marine:key(p)===key(initial)?snapshot?.wind:null;
    return [prev, snap&&{data:snap,at:snapshot.fetchedAt}]
      .filter(x=>x&&Number.isFinite(Date.parse(x.at))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))
      .map(x=>pack(x.data,type,x.at)).find(x=>x&&x.data.hourly.time.at(-1)>=startHour())??null;
  }
  async function request(type,p,signal){
    const args = new URLSearchParams({
      latitude:p.lat,longitude:p.lng,hourly:Object.keys(fields[type]).join(','),
      timezone:zone,timeformat:'unixtime',forecast_hours:192,
      ...(type==='marine'?{models:'meteofrance_wave',cell_selection:'sea'}:{wind_speed_unit:'ms',cell_selection:'nearest'})
    });
    const endpoint = type==='marine'?'https://marine-api.open-meteo.com/v1/marine':'https://api.open-meteo.com/v1/forecast';
    const res = await fetch(endpoint+'?'+args,{signal});
    if(!res.ok)throw Error('HTTP '+res.status);
    const record = pack(await res.json(),type,new Date().toISOString());
    if(!record || !record.data.hourly.time.some(t=>t>=startHour()&&Number.isFinite(record.values.get(t)[0]))) throw Error('No forecast');
    return record;
  }
  function setPoint(p){
    if(!extent.contains(p))return;
    point = {lat:Number(p.lat.toFixed(5)),lng:Number(p.lng.toFixed(5))};
    put('point',point);
    marker.setLatLng(point);loadWind();
    if(!marineData && !marineFlight)loadMarine();
  }
  async function loadWind(){
    windJob?.abort(); const job = windJob = new AbortController(), p = point;
    const timer = setTimeout(()=>job.abort(),12000);
    windBusy = true; windError = false; windData = cached('weather',p); render();
    try {
      const r = await request('weather',p,job.signal);
      if(job!==windJob)return;
      windData = r; put('weather:'+key(p),{data:r.data,at:r.at});
    }catch {if(job===windJob)windError=true;}
    finally {clearTimeout(timer); if(job===windJob){windBusy=false;render();}}
  }
  function loadMarine(){
    if(marineFlight)return marineFlight;
    marineJob = new AbortController();
    const timer = setTimeout(()=>marineJob.abort(),12000);
    marineBusy = true; marineError = false; render();
    marineFlight = request('marine',offshore,marineJob.signal)
      .then(r=>{marineData=r;put('marine',{data:r.data,at:r.at});})
      .catch(()=>{marineError=true;})
      .finally(()=>{clearTimeout(timer);marineBusy=false;marineFlight=null;render();});
    return marineFlight;
  }
  function tideAt(t){
    if(!tides.length||t<tides[0][0]||t>tides.at(-1)[0])return null;
    let a=0,b=tides.length-1;
    while(b-a>1){const i=(a+b)>>1;if(tides[i][0]<=t)a=i;else b=i;}
    const [ta,ya]=tides[a], [tb,yb]=tides[b];
    return (ya+yb)/2+(ya-yb)/2*Math.cos(Math.PI*(t-ta)/(tb-ta));
  }
  function render(){
    const start=startHour(), saved=rows[active]?.t;
    rows = Array.from({length:168},(_,i)=>{
      const t=start+i*hour, [wind,windDir,rain]=windData?.values.get(t)??[null,null,null],
        [swell,period,swellDir]=marineData?.values.get(t)??[null,null,null];
      return {t,wind,windDir,rain,swell,period,swellDir,tide:tideAt(t)};
    });
    if(saved!==undefined&&saved!==rows[active].t){
      active=Math.max(0,Math.min(167,Math.round((saved-start)/hour)));day=Math.floor(active/24);
    }
    $('coordinates').textContent=Math.abs(point.lat).toFixed(5)+'°S, '+point.lng.toFixed(5)+'°E';
    const counts=['wind','swell'].map(k=>rows.filter(r=>Number.isFinite(r[k])).length);
    const states=counts.map((n,i)=>{
      const busy=i?marineBusy:windBusy,error=i?marineError:windError, data=i?marineData:windData;
      if(busy)return '更新中';
      if(!n)return '暂无数据';
      if(error)return '缓存 '+stamp(Date.parse(data.at)/1000);
      return n===168?'已更新':n+'/168 小时';
    });
    $('status').textContent='风 '+states[0]+' · 浪 '+states[1];
    $('refresh').disabled=windBusy||marineBusy;
    for(const [i,button] of [...$('days').children].entries()){
      const interval = rows.slice(i*24,(i+1)*24);
      const peak = k => interval.some(r=>Number.isFinite(r[k]))?Math.max(...interval.map(r=>r[k]??-Infinity)):null;
      button.firstElementChild.textContent=stamp(interval[0].t);
      button.lastElementChild.textContent=f(peak('wind'))+' m/s · '+f(peak('swell'),2)+' m';
      button.setAttribute('aria-label',stamp(interval[0].t)+' 起 24 小时：最高风速 '+f(peak('wind'))+' 米每秒；最高外海涌浪 '+f(peak('swell'),2)+' 米');
    }
    syncControls();draw();readout();
  }
  function syncControls(){
    for(const name of ['week','day'])$(name).setAttribute('aria-pressed',String(range===name));
    for(const [i,b] of [...$('days').children].entries())b.setAttribute('aria-pressed',String(i===day));
    const slider=$('hour');slider.min=range==='day'?day*24:0;slider.max=range==='day'?day*24+23:167;slider.value=active;
    for(const b of $('metrics').children)b.setAttribute('aria-pressed',String(b.dataset.metric===metric));
  }
  function readout(){
    const r=rows[active];if(!r)return;
    $('selected-time').textContent=stamp(r.t);$('selected-time').dateTime=new Date(r.t*1000).toISOString();
    const [,unit,,digits]=metrics[metric];
    const value=Number.isFinite(r[metric])?f(r[metric],digits)+' '+unit:'—';
    $('hour-caption').textContent=stamp(r.t)+' · '+value;
    $('hour').setAttribute('aria-valuetext',stamp(r.t)+' 墨尔本时间，'+value);
    for(const id of ['wind','swell','tide','rain']){
      const [,unit,,d]=metrics[id];
      $(id+'-value').innerHTML=f(r[id],d)+(r[id]===null?'':' <span>'+unit+'</span>');
    }
    $('wind-direction').textContent=bearing(r.windDir);
    $('swell-detail').textContent=(r.period===null?'—':f(r.period)+' s 平均周期')+' · '+bearing(r.swellDir);
    if(chartX&&$('guide')){const x=chartX(active);$('guide').setAttribute('x1',x);$('guide').setAttribute('x2',x);}
  }
  function draw(){
    if(!rows.length)return;
    const svg=$('chart'), w=Math.max(730,svg.clientWidth), h=187, left=36,right=w-12, top=13,base=147;
    const from=range==='day'?day*24:0,to=range==='day'?from+23:167;
    const x=i=>left+(i-from)/(to-from)*(right-left);chartX=x;
    const [label,unit,color]=metrics[metric];
    $('chart-unit').textContent=unit;svg.setAttribute('aria-label',label+'，'+unit);svg.setAttribute('viewBox','0 0 '+w+' '+h);
    const visible=rows.slice(from,to+1), values=visible.map(r=>r[metric]).filter(Number.isFinite);
    const low=Math.min(0,Math.floor(Math.min(0,...values)*4)/4), peak=Math.max(0,...values);
    const step=Math.max(.25,Math.ceil(peak-low)/4);
    const y=v=>base-(v-low)/(step*4)*(base-top);
    let html='';
    if(range==='week')html+='<rect x="'+x(day*24)+'" y="'+top+'" width="'+(x(Math.min(167,day*24+24))-x(day*24))+'" height="'+(base-top)+'" fill="#ecf5f3"/>';
    for(let i=0;i<=4;i++){
      const value=low+i*step,yp=y(value);
      html+='<line x1="'+left+'" x2="'+right+'" y1="'+yp+'" y2="'+yp+'" stroke="#e0eaea"/><text x="'+(left-6)+'" y="'+(yp+4)+'" text-anchor="end">'+Number(value.toFixed(2))+'</text>';
    }
    const tickStep=range==='day'?3:12;
    for(let i=from;i<=to;i++){
      const r=rows[i],time=clock.format(r.t*1000);
      if(Number(time.slice(0,2))%tickStep!==0)continue;
      const xp=x(i), anchor=xp<left+17?'start':xp>right-17?'end':'middle';
      html+='<line x1="'+xp+'" x2="'+xp+'" y1="'+top+'" y2="'+base+'" stroke="#dce7e7" stroke-dasharray="2 4"/><text x="'+xp+'" y="163" text-anchor="'+anchor+'">'+date.format(r.t*1000)+'</text><text x="'+xp+'" y="177" text-anchor="'+anchor+'">'+time+'</text>';
    }
    let path='',open=false,valid=0;
    visible.forEach((r,j)=>{
      const value=r[metric];if(!Number.isFinite(value)){open=false;return;}
      const xp=x(from+j),yp=y(value);valid++;
      if(metric==='rain'){const bw=Math.min(14,(right-left)/(to-from)*.7);if(value>0)html+='<rect x="'+(xp-bw/2)+'" y="'+yp+'" width="'+bw+'" height="'+(base-yp)+'" fill="'+color+'" opacity=".68"/>';}
      else {path+=(open?'L':'M')+xp.toFixed(2)+' '+yp.toFixed(2)+' ';if(!open)html+='<circle cx="'+xp+'" cy="'+yp+'" r="1.75" fill="'+color+'"/>';open=true;}
    });
    if(path)html+='<path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="2.2" stroke-linejoin="round"/>';
    if(!valid)html+='<text x="'+(left+16)+'" y="82">暂无数据</text>';
    html+='<line id="guide" x1="'+x(active)+'" x2="'+x(active)+'" y1="'+top+'" y2="'+base+'" stroke="#4e696d" stroke-dasharray="4 3"/>';
    svg.innerHTML=html;
    svg.onclick=e=>{
      const box=svg.getBoundingClientRect(), px=(e.clientX-box.left)*w/box.width;
      chooseHour(Math.max(from,Math.min(to,Math.round(from+(px-left)/(right-left)*(to-from)))));
    };
  }
  function chooseHour(i){
    const next=Math.floor(i/24),newDay=day!==next;
    active=i;day=next;syncControls();if(newDay)draw();readout();
  }
  function setRange(mode,i=day){
    range=mode;day=i;
    if(mode==='day'&&Math.floor(active/24)!==i)active=i*24;
    syncControls();draw();readout();$('chart-scroll').scrollLeft=0;
  }
  function exportCsv(){
    const details=[
      ['selected_lat',point.lat,'selected_lon',point.lng],
      ['weather_retrieved_at',windData?.at],['offshore_marine_retrieved_at',marineData?.at],
      ['offshore_ref_lat',offshore.lat,'offshore_ref_lon',offshore.lng],
      ['tide_copyright','Commonwealth of Australia / BOM - modified by interpolation'],
      ['tide_terms','https://www.bom.gov.au/oceanography/projects/ntc/vic_tide_tables.shtml'],
      ['local_time_Australia_Melbourne','utc_time','wind_m_s','wind_from_deg','rain_mm','offshore_swell_hs_m','offshore_swell_mean_period_s','offshore_swell_from_deg','stony_point_reference_m_LAT']
    ];
    const local=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const lines=details.concat(rows.map(r=>[local.format(r.t*1000),new Date(r.t*1000).toISOString(),r.wind,r.windDir,r.rain,r.swell,r.period,r.swellDir,r.tide]));
    const url=URL.createObjectURL(new Blob([lines.map(r=>r.map(v=>v??'').join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='western-port-seven-days.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  for(let i=0;i<7;i++){
    const b=document.createElement('button');b.type='button';b.innerHTML='<b></b><small></small>';
    b.onclick=()=>setRange('day',i);$('days').append(b);
  }
  map.on('click',e=>setPoint(e.latlng));
  $('center-point').onclick=()=>setPoint(map.getCenter());
  $('refresh').onclick=()=>{loadWind();loadMarine();};
  $('week').onclick=()=>setRange('week');$('day').onclick=()=>setRange('day');
  $('metrics').onclick=e=>{if(!e.target.dataset.metric)return;metric=e.target.dataset.metric;syncControls();draw();readout();};
  $('hour').oninput=e=>chooseHour(Number(e.target.value));$('export').onclick=exportCsv;
  new ResizeObserver(()=>{map.invalidateSize({pan:false});draw();}).observe($('map'));
  new ResizeObserver(draw).observe($('chart-scroll'));
  marineData=cached('marine',offshore);loadWind();loadMarine();
})();
