import type { Plan } from './model.js';

export interface Frame { width: number; height: number; orientation: 'portrait' | 'landscape' }
export function figureLayout(width: number, height: number, label: number | null, frames: Frame[]) {
  const fits = frames.map(frame => ({ ...frame, scale: Math.min(1, frame.width / width, frame.height / height) })).sort((a, b) => b.scale - a.scale);
  const single = fits[0];
  if (label === null || single.scale * label >= 12) return { ...single, rows: 1, cols: 1, tiled: false };
  const scale = 12 / label;
  const candidates = fits.map(f => {
    const cols = Math.max(1, Math.ceil((width * scale / f.width - 0.1) / 0.9));
    const rows = Math.max(1, Math.ceil((height * scale / f.height - 0.1) / 0.9));
    return { ...f, scale, rows, cols, tiled: true };
  });
  return candidates.sort((a, b) => a.rows * a.cols - b.rows * b.cols || b.width - a.width)[0];
}
export function figureFrames(plan: Plan): Frame[] {
  const { paper, marginsMm: m } = plan.settings;
  const [w, h] = paper === 'A4' ? [210, 297] : [215.9, 279.4];
  return ([['portrait', w, h], ['landscape', h, w]] as const).map(([orientation, width, height]) => ({
    orientation, width: (width - m.left - m.right) * 96 / 25.4 - 60,
    height: (height - m.top - m.bottom) * 96 / 25.4 - 96
  }));
}
export function readingCSS(plan: Plan): string {
  const { paper, marginsMm: m, figures } = plan.settings;
  return `p{orphans:3;widows:3}h1,h2,h3,h4,h5,h6{break-after:avoid}
.answer-policy,.answer-reference{font-size:11px;color:#666}details{margin:12px 0}summary{font-weight:bold}
.answer-appendix{break-before:page}.answer{break-inside:auto}.answer h3{break-after:avoid}
@media print{details:not([open])>:not(summary){display:none}}
${figures === 'readable' ? `@page{size:${paper} portrait}
@page figurePortrait{size:${paper} portrait;margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm}
@page figureLandscape{size:${paper} landscape;margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm}
.readable-figure{break-before:page;break-after:page;margin:0;padding:0;overflow:hidden}
.readable-figure.portrait{page:figurePortrait}.readable-figure.landscape{page:figureLandscape}
.readable-figure figcaption{font-size:11px;line-height:16px;margin:0 0 12px}
.figure-content{display:flex;align-items:center;justify-content:center;height:var(--figure-height)}
.figure-content .mermaid{margin:0;display:block;padding:0}
.readable-figure svg,.readable-figure pre.mermaid svg,.readable-figure img{max-width:none;max-height:none}
.figure-content.detail>svg{outline:1px dashed #999}
@media screen{.readable-figure{border:1px solid #ccc;padding:12px;margin:20px 0;overflow:auto}}` : ''}`;
}
export function figureScript(plan: Plan): string {
  if (plan.settings.figures !== 'readable') return '';
  return `const chooseLayout=${figureLayout.toString()},frames=${JSON.stringify(figureFrames(plan))};
for(const source of document.querySelectorAll('.doc')){
 let number=0;
 for(const node of [...source.querySelectorAll('.mermaid,img')]){
  const svg=node.querySelector('svg'),vb=svg?.viewBox?.baseVal;
  const w=vb?.width||node.naturalWidth,h=vb?.height||node.naturalHeight;
  if(!w||!h)continue;
  const sizes=svg?[...svg.querySelectorAll('text,foreignObject span,foreignObject p')].map(n=>parseFloat(getComputedStyle(n).fontSize)).filter(n=>n>0):[];
  const label=svg?(sizes.length?Math.min(...sizes):16):null,rect=(svg||node).getBoundingClientRect();
  const readable=label===null?w<=frames[0].width&&h<=frames[0].height:Math.min(rect.width/w,rect.height/h)*label>=12;
  if(readable&&rect.height<=frames[0].height&&rect.width<=frames[0].width)continue;
  const layout=chooseLayout(w,h,label,frames);number++;
  if(layout.rows*layout.cols>24){window.packetErrors.push('Figure '+number+' needs more than 24 readable tiles; split the source diagram or choose Fit figures');continue;}
  const marker=document.createElement('span');node.before(marker);node.remove();
  const sheet=(content,caption,detail=false)=>{const f=document.createElement('figure');f.className='readable-figure '+layout.orientation;f.style.setProperty('--figure-height',layout.height+'px');const c=document.createElement('figcaption');c.textContent='Figure '+number+' · '+caption;const box=document.createElement('div');box.className='figure-content'+(detail?' detail':'');box.append(content);f.append(c,box);marker.before(f);};
  const size=(s,width,height,scale)=>{s.style.width=width*scale+'px';s.style.height=height*scale+'px';s.style.maxWidth='none';s.style.maxHeight='none';};
  const fit=Math.min(1,layout.width/w,layout.height/h);
  size(svg||node,w,h,fit);
  sheet(node,layout.orientation+(layout.tiled?' overview; readable detail tiles follow':' figure'));
  if(layout.tiled&&svg){
   const tw=w/(layout.cols-(layout.cols-1)*0.1),th=h/(layout.rows-(layout.rows-1)*0.1);
   for(let row=0;row<layout.rows;row++)for(let col=0;col<layout.cols;col++){
    const clone=svg.cloneNode(true),x=vb.x+col*tw*0.9,y=vb.y+row*th*0.9;
    clone.style.overflow='hidden';clone.setAttribute('viewBox',[x,y,tw,th].join(' '));size(clone,tw,th,Math.min(layout.width/tw,layout.height/th,Math.max(1,layout.scale)));
    const adjacent=[];if(col>0)adjacent.push('left: column '+col);if(col+1<layout.cols)adjacent.push('right: column '+(col+2));if(row>0)adjacent.push('above: row '+row);if(row+1<layout.rows)adjacent.push('below: row '+(row+2));
    sheet(clone,'detail tile row '+(row+1)+'/'+layout.rows+', column '+(col+1)+'/'+layout.cols+'. Cut edges continue '+adjacent.join('; ')+'. 10% overlap.',true);
   }
  }
  marker.remove();
 }
}`;
}
