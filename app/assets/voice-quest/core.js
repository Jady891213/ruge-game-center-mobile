(function(root){
'use strict';
// One true tile-state implementation is used by the UI and the solver.
const layouts=[
['#######','#.....#','#S.aG.#','#.....#','#######'],
['#######','#..a..#','#S.#G.#','#.....#','#######'],
['#######','#.....#','#S.^aG#','#.....#','#######'],
['########','#......#','#S.a#G.#','#......#','########'],
['########','#...a..#','#S.##..#','#....G.#','########'],
['########','#......#','#S.^.aG#','#.###..#','########'],
['########','#a..#..#','#.#.#G.#','#S..^..#','########'],
['########','#..a...#','#.###..#','#S.^.G.#','########'],
['########','#..#a..#','#S.#.#G#','#..^...#','########'],
['#########','#...a...#','#S.###.G#','#...^...#','#########'],
['#########','#a.#....#','#..#.^G.#','#S...#..#','#########'],
['#########','#..a.#..#','#S.#.^G.#','#..#....#','#########'],
['#########','#a...#..#','#.##.#G.#','#S.^....#','#########'],
['#########','#...#a..#','#S..#.#G#','#..^....#','#########'],
['#########','#..a....#','#.###.#.#','#S.^..#G#','#.......#','#########'],
['#########','#...#a..#','#S#.#.#G#','#...^...#','#.......#','#########'],
['#########','#a......#','#.###.#G#','#S.^..#.#','#.......#','#########'],
['#########','#..#a...#','#S.#.##G#','#..^....#','#.......#','#########']];
layouts.push(...[["#########","#.#...#.#","#.#.#.#.#","#..a#...#","#######.#","#G^....S#","#########"],["#########","#...#..a#","#.#####.#","#.#.^S#.#","#.#.#.#.#","#..G#...#","#########"],["#########","#a....#.#","#.#####.#","#.^.....#","#######.#","#S.....G#","#########"],["#########","#a#..S..#","#.#.#####","#.#.^.#.#","#.###.#.#","#G......#","#########"],["#########","#..a.S..#","###.#.###","#G#.#...#","#^#####.#","#.......#","#########"],["#########","#S......#","#####.#.#","#...#.#.#","#.###.#.#","#a^..G#.#","#########"],["#########","#a...G..#","###.#####","#...#..S#","#^#####^#","#.......#","#########"],["#########","#..S^a..#","###.#####","#...#G..#","#.###.###","#...^...#","#########"],["#########","#....a#.#","#.###^#.#","#.#S#..G#","#.#.###.#","#.#...^.#","#########"],["#########","#...#...#","#.#^###.#","#.#G..#.#","#.###^#.#","#..S#a..#","#########"],["#########","#.^..G..#","#.#######","#...^...#","#.#####.#","#...#S.a#","#########"],["#########","#G......#","#.#.###.#","#.#.^.#.#","#.###^###","#..a#S..#","#########"],["#########","#.#.....#","#.#^#^#^#","#.#G#.#.#","#.###.#.#","#....S#a#","#########"],["#########","#S..#..a#","#.###^#.#","#G#...#.#","#^###^#.#","#.....#.#","#########"],["#########","#.^a#...#","#.#####.#","#.#...^S#","#.#^#####","#....G..#","#########"],["#########","#.^a^.#G#","#.###^#.#","#...#...#","###.#####","#S......#","#########"],["#########","#..a^.#.#","###.#.#.#","#...#S^.#","#######.#","#G....^.#","#########"],["#########","#......a#","#.#####.#","#.#..G^.#","#.#######","#.^.^S..#","#########"]]);
const levels=layouts.map((rows,i)=>{let start,item,goal;rows.forEach((r,y)=>[...r].forEach((c,x)=>{if(c==='S')start=[x,y];if(c==='a')item=[x,y];if(c==='G')goal=[x,y];}));return{id:i+1,rows,start,item,goal,width:rows[0].length,height:rows.length,itemKind:i%3===0?'key':i%3===1?'apple':'star',initialFacing:i<18?'right':['up','left','down','right'][(i-18)%4],goalKind:i%3===0?'door':i%3===1?'friend':'nest'};});
const directions={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]},commands=Object.keys(directions).concat(['forward','backward','turnLeft','turnRight','jump','take','put','open','feed','deliver','stop']);
function create(index=0,saved){const level=levels[Math.max(0,Math.min(levels.length-1,index))];let x=level.start[0],y=level.start[1],facing=level.initialFacing,jump=false,carrying=false,item=[...level.item],won=false,paused=false,moves=0;
function cell(a,b){return level.rows[b]?.[a]||'#';}
if(saved&&saved.level===level.id&&Number.isInteger(saved.x)&&Number.isInteger(saved.y)&&cell(saved.x,saved.y)!=='#'&&cell(saved.x,saved.y)!=='^'){x=saved.x;y=saved.y;facing=Object.prototype.hasOwnProperty.call(directions,saved.facing)?saved.facing:'right';carrying=saved.carrying===true;const p=saved.item;if(!carrying&&Array.isArray(p)&&p.length===2&&Number.isInteger(p[0])&&Number.isInteger(p[1])&&cell(...p)!=='#'&&cell(...p)!=='^')item=[...p];}
function snapshot(){return{level:level.id,x,y,facing,jump,carrying,item:[...item],won,paused,moves};}
function act(command){if(paused||won||!commands.includes(command))return{type:'ignored'};if(command==='turnLeft'||command==='turnRight'){const ring=['up','right','down','left'];facing=ring[(ring.indexOf(facing)+(command==='turnRight'?1:3))%4];moves++;return{type:'turn'};}if(['open','feed','deliver'].includes(command)){const kind={open:'door',feed:'friend',deliver:'nest'}[command];if(level.goalKind!==kind||!carrying||x!==level.goal[0]||y!==level.goal[1])return{type:'wrong-task'};command='put';}let preserveFacing=false;if(command==='forward'||command==='backward'){const ring=['up','right','down','left'];command=ring[(ring.indexOf(facing)+(command==='backward'?2:0))%4];preserveFacing=true;}if(command==='stop'){jump=false;return{type:'stop'};}if(command==='jump'){const [dx,dy]=directions[facing],nx=x+dx*2,ny=y+dy*2;if(cell(x+dx,y+dy)==='^'&&cell(nx,ny)!=='#'&&cell(nx,ny)!=='^'){x=nx;y=ny;moves++;return{type:'jump'};}return{type:'hop'};}if(command==='take'){if(!carrying&&item[0]===x&&item[1]===y){carrying=true;moves++;return{type:'take'};}return{type:'empty'};}if(command==='put'){if(!carrying)return{type:'empty'};if(x===level.goal[0]&&y===level.goal[1]){carrying=false;won=true;moves++;return{type:'win'};}carrying=false;item=[x,y];moves++;return{type:'put'};}
const [dx,dy]=directions[command];if(!preserveFacing)facing=command;let nx=x+dx,ny=y+dy;if(cell(nx,ny)==='^')return{type:'need-jump'};
if(cell(nx,ny)==='#'||cell(nx,ny)==='^'){jump=false;return{type:'wall'};}x=nx;y=ny;jump=false;moves++;return{type:'move'};}
return{level,act,snapshot,pause(v=true){paused=!!v;},save(){const s=snapshot();delete s.paused;delete s.won;delete s.jump;return s;}};}
function key(s){return[s.x,s.y,s.facing,+s.jump,+s.carrying,...s.item].join(',');}
// A blocked absolute step still changes facing; keep that state for a following jump.
function solve(index){const engine=create(index),queue=[{s:engine.snapshot(),path:[]}],seen=new Set();for(let q=0;q<queue.length&&q<50000;q++){const {s,path}=queue[q];for(const action of Object.keys(directions).concat(['jump','take','put'])){const e=create(index,s);if(s.jump)e.act('jump');const result=e.act(action),n=e.snapshot();if(result.type==='win')return path.concat(action);if(['empty','ignored'].includes(result.type))continue;const k=key(n);if(!seen.has(k)){seen.add(k);queue.push({s:n,path:path.concat(action)});}}}return null;}
root.VoiceQuestCore={levels,commands,create,solve};
})(typeof window==='undefined'?globalThis:window);
