import { computeArchive, ELEMENT_NAME } from '../miniprogram/lib/archive.js';
function pad(n){return String(n).padStart(2,'0');}
function fmtUTC(utc){ if(!utc) return '—'; const s=utc.slice(0,16).replace('T',' '); return s+' (UTC)'; }
// 完整复刻 index.js onGenerate 的字段访问链，2003-01-30 出生 13:50
function simulate(Y,M,D,H,lon){
  try{
    const f=computeArchive(Y,M,D,H,lon);
    const pillars=['year','month','day','hour'].filter(k=>f.four[k]).map(k=>({label:f.four[k].label, ganz:f.four[k].ganz, element:ELEMENT_NAME[f.four[k].element]}));
    const tallyList=['wood','fire','earth','metal','water'].map(k=>({name:ELEMENT_NAME[k], n:(f.tally[k]||0)})).filter(x=>x.n>0);
    const term=f.term.next?(f.term.next.name+' '+fmtUTC(f.term.next.utc)):'—';
    const prevTerm=f.term.prev?(f.term.prev.name+' '+fmtUTC(f.term.prev.utc)):'—';
    const moon=f.moon? (f.moon.name+'（朔望月龄 '+Number(f.moon.ageDays).toFixed(1)+' 天）'):'—';
    const daysToNext= f.term.daysToNext!=null? Number(f.term.daysToNext).toFixed(2)+' 天':'—';
    const trueSolar= f.trueSolar.degraded? '未提供经度':'+'+Number(f.trueSolar.offsetMinutes).toFixed(1)+' 分钟';
    return {pillars,tallyList,term,prevTerm,moon,daysToNext,trueSolar, gan: f.four.year.ganz + f.four.day.ganz};
  }catch(e){ return {err:e.message, stack:(e.stack||'').split('\n').slice(0,6).join('\n')}; }
}
for (const c of [[2003,1,30,13,null],[2003,1,30,-1,null],[2003,1,30,13,116.397],[2003,1,30,0,null]]){
  const r=simulate(...c);
  console.log(JSON.stringify(c),'=>', r.err? ('ERR '+r.err+' | '+r.stack) : ('OK pillars='+r.pillars.length+' gan='+r.tallyList.map(t=>t.name+t.n).join(',')+' term='+r.term));
}