import type { Plan } from './model.js';

export function readingCSS(plan: Plan): string {
  const { paper, marginsMm: m, figures } = plan.settings;
  return `
p{orphans:3;widows:3}h1,h2,h3,h4,h5,h6{break-after:avoid}blockquote{break-inside:auto}
.answer-policy,.answer-reference{font-size:11px;color:#666}details{margin:12px 0}summary{font-weight:bold}
.answer-appendix{break-before:page}.answer{break-inside:auto}.answer h3{break-after:avoid}
@media print{details:not([open])>:not(summary){display:none}}
${figures === 'readable' ? `@page{size:${paper} portrait}@page wide{size:${paper} landscape;margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm}
.readable-figure{page:wide;break-before:page;break-after:page;margin:0;padding:0;overflow:hidden}
.readable-figure figcaption{font-size:11px;margin:0 0 10px}.readable-figure .mermaid{display:block;margin:0}
.readable-figure svg,.readable-figure img{max-width:100%;max-height:var(--figure-height);object-fit:contain}
.readable-figure pre.mermaid svg{max-height:var(--figure-height)}
@media screen{.readable-figure{border:1px solid #ccc;padding:12px;margin:20px 0;overflow:auto}}` : ''}`;
}
/** Runs after bundled Mermaid, never code provided by source documents. */
export function figureScript(plan: Plan): string {
  if (plan.settings.figures !== 'readable') return '';
  const { paper, marginsMm: m } = plan.settings;
  const width = ((paper === 'A4' ? 297 : 279.4) - m.left - m.right) * 96 / 25.4 - 60;
  const height = ((paper === 'A4' ? 210 : 215.9) - m.top - m.bottom) * 96 / 25.4 - 70;
  return `const figureWidth=${width},figureHeight=${height};
for(const source of document.querySelectorAll('.doc')){
  let figureNumber=0;
  for(const node of [...source.querySelectorAll('.mermaid, img')]){
    if(node.closest('.readable-figure'))continue;
    const svg=node.querySelector('svg');
    const vb=svg?.viewBox?.baseVal;
    const nativeWidth=vb?.width||node.naturalWidth||0,nativeHeight=vb?.height||node.naturalHeight||0;
    if(!nativeWidth||!nativeHeight)continue;
    const portraitWidth=${((paper === 'A4' ? 210 : 215.9) - m.left - m.right) * 96 / 25.4 - 60};
    const labelSizes=svg?[...svg.querySelectorAll('text,foreignObject span,foreignObject p')].map(n=>parseFloat(getComputedStyle(n).fontSize)).filter(n=>n>0):[];
    const minLabel=labelSizes.length?Math.min(...labelSizes):16;
    if(nativeWidth<=portraitWidth&&nativeHeight<=figureHeight&&minLabel*Math.min(1,portraitWidth/nativeWidth)>=12)continue;
    const number=++figureNumber;
    const sheet=(content,caption)=>{const figure=document.createElement('figure');figure.className='readable-figure';figure.style.setProperty('--figure-height',figureHeight+'px');const label=document.createElement('figcaption');label.textContent='Figure '+number+' · '+caption;figure.append(label,content);return figure;};
    const marker=document.createElement('span');node.before(marker);node.remove();
    const overview=sheet(node,'landscape overview');marker.before(overview);
    if(svg){
      const fit=Math.min(1,figureWidth/nativeWidth,figureHeight/nativeHeight),scale=Math.max(fit,12/minLabel);
      svg.style.width=Math.min(nativeWidth,figureWidth)+'px';svg.style.height=Math.min(nativeHeight,figureHeight)+'px';
      if(fit*minLabel<12){
        const tileWidth=Math.min(nativeWidth,figureWidth/scale),tileHeight=Math.min(nativeHeight,figureHeight/scale),overlap=Math.min(180/scale,tileWidth/3,tileHeight/3);
        const cols=Math.max(1,Math.ceil((nativeWidth-overlap)/Math.max(1,tileWidth-overlap))),rows=Math.max(1,Math.ceil((nativeHeight-overlap)/Math.max(1,tileHeight-overlap)));
        if(cols*rows>24){window.packetErrors.push('Figure '+number+' needs more than 24 readable tiles; split the source diagram or choose Fit figures');continue;}
        for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
          const clone=svg.cloneNode(true),x=vb.x+Math.min(col*(tileWidth-overlap),nativeWidth-tileWidth),y=vb.y+Math.min(row*(tileHeight-overlap),nativeHeight-tileHeight);
          clone.setAttribute('viewBox',[x,y,tileWidth,tileHeight].join(' '));clone.setAttribute('width',String(tileWidth*scale));clone.setAttribute('height',String(tileHeight*scale));clone.style.width=tileWidth*scale+'px';clone.style.height=tileHeight*scale+'px';clone.style.maxWidth='none';
          marker.before(sheet(clone,'detail tile '+(row+1)+'/'+rows+', '+(col+1)+'/'+cols+' (overlapping edges)'));
        }
      }
    }else{node.style.width='auto';node.style.maxWidth=figureWidth+'px';node.style.maxHeight=figureHeight+'px';}
    marker.remove();
  }
}`;
}
