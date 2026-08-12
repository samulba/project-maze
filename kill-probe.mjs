import WebSocket from 'ws';
const s=new WebSocket('ws://127.0.0.1:2701');
let start=0,self=null,shapes=[],seq=0,lastK=0,lastD=0,lastStreak=0;
const ev=[];
s.on('open',()=>{start=Date.now();s.send(JSON.stringify({type:'join',name:'Kills'}));});
s.on('message',(raw)=>{const m=JSON.parse(raw.toString());if(m.type!=='snapshot')return;
 const t=(Date.now()-start)/1000; const me=m.players.find(p=>String(p.id)===String(m.selfId)); if(!me)return; self=me; shapes=m.shapes;
 if(me.kills>lastK){ev.push(`${t.toFixed(1)}s KILL #${me.kills} (Streak ${me.streak}, Level ${me.level})`);lastK=me.kills;}
 if(me.deaths>lastD){ev.push(`${t.toFixed(1)}s TOD #${me.deaths} auf Level ${me.deathLevel}`);lastD=me.deaths;}
 if(t>Number(process.env.DAUER??300)){console.log(ev.join('\n'));console.log(`--- Kills gesamt ${lastK}, Tode ${lastD}, beste Streak ${me.bestStreak}, Score ${me.score}, Level ${me.level}`);process.exit(0);} });
setInterval(()=>{if(!self||s.readyState!==1)return;
 if(self.dead){s.send(JSON.stringify({type:'respawn'}));return;}
 if(self.level>=5&&self.playerClass==='core')s.send(JSON.stringify({type:'chooseClass',playerClass:'rapid'}));
 if(self.availablePoints>0)s.send(JSON.stringify({type:'upgrade',upgrade:['damage','reload','maxHealth','moveSpeed'][self.level%4]}));
 let best=null,bd=Infinity;for(const sh of shapes){const d=Math.hypot(sh.position.x-self.position.x,sh.position.y-self.position.y);if(d<bd){bd=d;best=sh;}}
 let move={x:0,y:0},aim={x:650,y:0};
 if(best){const dx=best.position.x-self.position.x,dy=best.position.y-self.position.y,l=Math.hypot(dx,dy)||1;aim={x:dx/l*650,y:dy/l*650};if(bd>200)move={x:dx/l,y:dy/l};}
 s.send(JSON.stringify({type:'input',sequence:++seq,move,aim,primary:true,secondary:false}));},50);
