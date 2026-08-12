import WebSocket from 'ws';
const s = new WebSocket(process.env.URL ?? 'ws://127.0.0.1:2701');
const DAUER = Number(process.env.DAUER ?? 90);
s.on('open', () => { start = Date.now(); s.send(JSON.stringify({ type: 'join', name: process.env.NAME ?? 'Beobachter' })); });
let start = Date.now(), seq = 0, self = null, shapes = [];
const proben = []; let ersterGegner = null; let gegnerProben = [];
s.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type !== 'snapshot') return;
  const t = (Date.now() - start) / 1000;
  self = m.players.find(p => String(p.id) === String(m.selfId));
  if (!self) return;
  shapes = m.shapes;
  const gegner = m.players.filter(p => String(p.id) !== String(m.selfId) && !p.dead);
  if (gegner.length > 0 && ersterGegner === null) ersterGegner = t;
  proben.push(m.shapes.length);
  gegnerProben.push(gegner.length);
  if (t > DAUER) {
    const mittel = a => (a.reduce((x,y)=>x+y,0)/a.length).toFixed(2);
    console.log(`Dauer ${t.toFixed(0)}s, Proben ${proben.length}`);
    console.log(`Formen im Bild: Mittel ${mittel(proben)}  min ${Math.min(...proben)}  max ${Math.max(...proben)}`);
    console.log(`Gegner im Bild: Mittel ${mittel(gegnerProben)}  Anteil Proben ohne Gegner: ${(gegnerProben.filter(x=>x===0).length/gegnerProben.length*100).toFixed(1)}%`);
    console.log(`Erster Gegner sichtbar nach: ${ersterGegner === null ? 'nie' : ersterGegner.toFixed(1)+'s'}`);
    process.exit(0);
  }
});
// Bewegt sich wie ein Neuling: faehrt zur naechsten Form
setInterval(() => {
  if (!self || s.readyState !== 1) return;
  let best=null,bd=Infinity;
  for (const sh of shapes){const d=Math.hypot(sh.position.x-self.position.x,sh.position.y-self.position.y); if(d<bd){bd=d;best=sh;}}
  let move={x:0,y:0}, aim={x:650,y:0};
  if(best){const dx=best.position.x-self.position.x,dy=best.position.y-self.position.y,l=Math.hypot(dx,dy)||1;aim={x:dx/l*650,y:dy/l*650}; if(bd>200)move={x:dx/l,y:dy/l};}
  s.send(JSON.stringify({type:'input',sequence:++seq,move,aim,primary:true,secondary:false}));
}, 50);
