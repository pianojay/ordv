import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {discover} from '../src/core/discover.js';
import {exportPDF,launchBrowser} from '../src/core/export.js';
import {readingCSS,figureScript,figureFrames,figureLayout} from '../src/core/figures.js';
const out=path.resolve('output/figure-regression');await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'README.md'),'# Figure acceptance');const plan=await discover(out);plan.settings.figures='readable';
const {browser,close}=await launchBrowser();
try{
 for(const [name,w,h,label] of [['tall',527.125,942,'TALL_LABEL'],['wide',1200,400,'WIDE_LABEL'],['threshold',1350,400,'EDGE_LABEL'],['tall-tiles',500,1600,'TILE_LABEL']] as const){
  const page=await browser.newPage();await page.emulateMediaType('print');await page.setViewport({width:718,height:1000});
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" style="width:100%;max-height:550px"><rect x="2" y="2" width="${w-4}" height="${h-4}" fill="none" stroke="black"/><path d="M20 80 L${w-20} ${h-50}" stroke="black"/><text x="20" y="40" style="font:16px Arial">${label}</text><text x="${w-180}" y="${h-20}" style="font:16px Arial">END_LABEL</text></svg>`;
  await page.setContent(`<style>body{font:14px Arial;margin:8px;padding:12px}.mermaid{margin:0}${readingCSS(plan)}</style><section class="doc"><pre class="mermaid">${svg}</pre></section>`);
  await page.evaluate(()=>{(window as any).packetErrors=[];});await page.addScriptTag({content:figureScript(plan)});
  const measured=await page.evaluate(()=>({errors:(window as any).packetErrors,figures:[...document.querySelectorAll('figure')].map(f=>({orientation:f.className,caption:f.querySelector('figcaption')!.textContent,viewBox:f.querySelector('svg')!.getAttribute('viewBox')}))}));
  assert.deepEqual(measured.errors,[]);const expected=figureLayout(w,h,16,figureFrames(plan));
  assert.equal(measured.figures.length,expected.tiled?1+expected.rows*expected.cols:1);
  assert(measured.figures.every(f=>f.orientation.includes(expected.orientation)));
  if(expected.tiled){
    const boxes=measured.figures.slice(1).map(f=>f.viewBox!.split(/\s+/).map(Number));
    assert(Math.abs(Math.min(...boxes.map(b=>b[0])))<.01);
    assert(Math.abs(Math.min(...boxes.map(b=>b[1])))<.01);
    assert(Math.abs(Math.max(...boxes.map(b=>b[0]+b[2]))-w)<.01);
    assert(Math.abs(Math.max(...boxes.map(b=>b[1]+b[3]))-h)<.01);
    if(expected.cols>1)assert(Math.abs((boxes[0][2]-boxes[1][0])/boxes[0][2]-.1)<.001);
  }
  const file=path.join(out,name+'.pdf');await page.pdf({path:file,preferCSSPageSize:true,printBackground:true});
  execFileSync(process.env.ORDV_TEST_PYTHON||'python',['-c',`import pdfplumber\nwith pdfplumber.open(r'${file}') as d:\n assert len(d.pages)==${measured.figures.length},len(d.pages)\n checked=0\n for p in d.pages:\n  assert (p.width>p.height)==${expected.orientation==='landscape'?'True':'False'}\n  if ${expected.tiled?'True':'False'} and 'detail tile row' not in (p.extract_text() or ''):continue\n  hits=p.search('${label}',return_chars=True)\n  for hit in hits:\n   assert all(c['size']>=8.99 for c in hit['chars']),[(c['text'],c['size']) for c in hit['chars']]\n   checked+=1\n assert checked>0\n print('${name}:',len(d.pages),'pages, labels >=9pt, orientation ${expected.orientation}')`],{stdio:'inherit'});
  await page.close();
 }
 for(const [orientation,w,h] of [['landscape',6000,4000],['portrait',4000,6000]] as const){
  const page=await browser.newPage();
  const png=await page.evaluate((width,height)=>{
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext('2d')!;
   for(const [x,y,color] of [[0,0,'red'],[1,0,'lime'],[0,1,'blue'],[1,1,'yellow']] as const){
    ctx.fillStyle=color;ctx.fillRect(x*width/2,y*height/2,width/2,height/2);
   }
   return canvas.toDataURL('image/png').split(',')[1];
  },w,h);
  await page.close();
  await fs.writeFile(path.join(out,orientation+'.png'),Buffer.from(png,'base64'));
  const source=path.join(out,orientation+'.md');
  await fs.writeFile(source,`# High resolution image\n\n![Four complete color quadrants](${orientation}.png)`);
  const imagePlan=await discover(source);imagePlan.settings.toc=false;
  for(const mode of ['book','documents'] as const)for(const figures of ['readable','fit'] as const){
   imagePlan.settings.mode=mode;imagePlan.settings.figures=figures;
   const name=`image-${orientation}-${mode}-${figures}`,file=path.join(out,name+'.pdf');
   const result=await exportPDF(imagePlan);await fs.writeFile(file,result.bytes);
   execFileSync(process.env.ORDV_TEST_PYTHON||'python',['-c',`import pdfplumber
with pdfplumber.open(${JSON.stringify(file)}) as d:
 images=[(p,i) for p in d.pages for i in p.images]
 assert len(images)==1,len(images)
 p,i=images[0]
 assert tuple(i['srcsize'])==(${w},${h}),i['srcsize']
 assert (p.width>p.height)==${figures==='readable'&&orientation==='landscape'?'True':'False'}
 assert 0<=i['x0']<i['x1']<=p.width and 0<=i['top']<i['bottom']<=p.height,i
 assert abs(i['width']/i['height']-${w/h})<0.01,i
 text=''.join(p.extract_text() or '' for p in d.pages)
 assert 'detail tile' not in text and 'overview' not in text,text
 if ${figures==='readable'?'True':'False'}: assert '${orientation} figure' in text,text
 rendered=p.to_image(resolution=96).original.convert('RGB')
 for x,y,color in [(0.05,0.05,(255,0,0)),(0.95,0.05,(0,255,0)),(0.05,0.95,(0,0,255)),(0.95,0.95,(255,255,0))]:
  pixel=rendered.getpixel((round((i['x0']+x*i['width'])*rendered.width/p.width),round((i['top']+y*i['height'])*rendered.height/p.height)))
  assert max(abs(a-b) for a,b in zip(pixel,color))<10,(pixel,color)
 print('${name}: one complete raster, correct orientation, four corners captured, no detail tiles')
`],{stdio:'inherit'});
  }
 }
}finally{await close();}
