import {it,expect} from 'vitest';
import {figureLayout} from '../src/core/figures.js';
const frames=[{orientation:'portrait' as const,width:658,height:950},{orientation:'landscape' as const,width:987,height:629}];
it('chooses one portrait page for the reported tall diagram',()=>{expect(figureLayout(527.125,942,16,frames)).toMatchObject({orientation:'portrait',tiled:false});});
it('chooses one landscape page for a wide diagram',()=>{expect(figureLayout(1200,400,16,frames)).toMatchObject({orientation:'landscape',tiled:false});});
it('tiles only beyond both single-page readability thresholds',()=>{const p=figureLayout(1400,400,16,frames);expect(p.tiled).toBe(true);expect(p.cols*p.rows).toBe(2);const tile=1400/(p.cols-(p.cols-1)*.1);expect(tile*p.scale).toBeLessThanOrEqual(p.width);expect((tile*.9*(p.cols-1)+tile)).toBeCloseTo(1400);});
it.each([[6000,4000,'landscape'],[4000,6000,'portrait']] as const)('fits a %ix%i image without a label floor on one %s page',(width,height,orientation)=>{
 const layout=figureLayout(width,height,null,frames);
 expect(layout).toMatchObject({orientation,rows:1,cols:1,tiled:false});
 expect(width*layout.scale).toBeLessThanOrEqual(layout.width);
 expect(height*layout.scale).toBeLessThanOrEqual(layout.height);
});
