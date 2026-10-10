export function mileageSummary(readings,occupations=[]){
 const rows=[...readings].sort((a,b)=>Date.parse(a.leitura_em)-Date.parse(b.leitura_em)),people=new Map();let km=0,days=0;
 for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i],dayOnly=a.precisao_data==='dia'||b.precisao_data==='dia',time=r=>dayOnly?Date.parse(new Date(Date.parse(r.leitura_em)-4*3600000).toISOString().slice(0,10)+'T00:00:00-04:00'):Date.parse(r.leitura_em),d=(time(b)-time(a))/86400000,k=Number(b.km)-Number(a.km);if(d<=0||k<0)continue;km+=k;days+=d;
  const interrupted=occupations.some(p=>p.key!==a.ocupacao_chave&&Date.parse(p.start)<Date.parse(b.leitura_em)&&(!p.end||Date.parse(p.end)>Date.parse(a.leitura_em)));
  if(a.ocupacao_chave&&a.ocupacao_chave===b.ocupacao_chave&&!interrupted){const x=people.get(b.ocupacao_chave)||{nome:b.responsavel||'Sem identificação',cliente_id:b.cliente_id,km:0,days:0};x.km+=k;x.days+=d;people.set(b.ocupacao_chave,x);}
 }return {km,days,average:days?km/days:null,people:[...people.values()].map(x=>({...x,average:x.km/x.days}))};
}
export function weeklyReminder(rows,now=Date.now()){const latest=rows.reduce((n,r)=>Math.max(n,Date.parse(r.leitura_em)||0),0);return {due:!latest||now-latest>=7*86400000,days:latest?Math.floor((now-latest)/86400000):null};}
