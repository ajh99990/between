import {paintCreativeA} from './creative-a.js';
import {paintCreativeB} from './creative-b.js';
// Procedural color fields; all artwork is generated locally from normalized coordinates.
const BASE=[21,24,29];
const clamp=value=>Math.max(0,Math.min(1,value));
const gauss=(u,v,x,y,rx,ry)=>Math.exp(-2*(((u-x)/rx)**2+((v-y)/ry)**2));
export const PRESETS=Object.freeze([
  {id:'ribbon',label:'蓝灰流带',dynamic:false,loopSeconds:36,description:'横向铺开的蓝灰空气光，起步即有柔和流动。'},
  {id:'mist',label:'青灰雾光',dynamic:false,loopSeconds:36,description:'纵向青灰雾柱，带轻微位移与呼吸。'},
  {id:'ember',label:'琥珀微晕',dynamic:false,loopSeconds:36,description:'低对比暖晕，在石墨色空间中轻轻漂移。'},
  {id:'tide',label:'薄雾波面',dynamic:true,loopSeconds:84,description:'宽缓波脊交错起伏，流速与曲率比基础版更清晰。'},
  {id:'curtain',label:'虹纱织幕',dynamic:true,loopSeconds:64,softness:5,original:true,description:'青玉、鸢紫与暖玫交织成轻薄纱幕，褶皱随时间舒展。'},
  {id:'orbit',label:'游弧微光',dynamic:true,loopSeconds:64,softness:7,original:true,description:'几段有远近的弧形光雾缓慢游移，边缘若隐若现。'},
  {id:'caustic',label:'浮光涟域',dynamic:true,loopSeconds:64,softness:9,original:true,description:'蓝绿浮光聚散，暖色隐约渗入，像有深浅的流动空气。'},
  {id:'terrace',label:'层光漫游',dynamic:true,loopSeconds:64,softness:14,original:true,description:'铜金、雾蓝与石墨色层相互渗透，保留舒卷而不勾勒实物。'},
].map(Object.freeze));
export function paintField(canvas,preset,time=0){
  if(['curtain','orbit'].includes(preset))return paintCreativeA(canvas,preset,((time%64)+64)%64);
  if(['caustic','terrace'].includes(preset))return paintCreativeB(canvas,preset,((time%64)+64)%64);
  const w=preset==='tide'?360:640,h=preset==='tide'?225:400;
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const context=canvas.getContext('2d');
  const image=context.createImageData(w,h),data=image.data;
  const phase=(((time%84)+84)%84)*Math.PI*2/84;
  for(let y=0;y<h;y++){
    const v=y/(h-1);
    for(let x=0;x<w;x++){
      const u=x/(w-1);let additions;
      if(preset==='mist'){
        const a=gauss(u,v,.60,.77,.25,.58),b=gauss(u,v,.47,.58,.38,.56),c=gauss(u,v,.75,.91,.32,.25);
        additions=[a*4+b*3,a*24+b*9+c*7,a*29+b*13+c*9];
      }else if(preset==='ember'){
        const a=gauss(u,v,.23,.38,.36,.32),b=gauss(u,v,.42,.52,.45,.42);
        additions=[a*27+b*8,a*15+b*5,a*4+b*2];
      }else if(preset==='tide'){
        const ridge=.52+.115*Math.sin(u*5.0+phase)+.048*Math.sin(u*9.0-phase*2);
        const lower=.86+.08*Math.cos(u*4.1-phase)+.029*Math.sin(u*11+phase*2);
        const crest=Math.exp(-1*((v-ridge)/.14)**2),swell=Math.exp(-1*((v-lower)/.24)**2);
        const fog=clamp((v-.13)/.67);
        const light=(crest*.62+swell*.56)*fog;
        additions=[light*9+fog*1,light*24+fog*9,light*35+fog*15];
      }else{
        const a=gauss(u,v,-.02,.90,.92,.84),b=gauss(u,v,.36,.65,.67,.35),c=gauss(u,v,.94,.87,.72,.60);
        const ribbon=Math.exp(-1*((v-(.59+.12*Math.sin(u*3.4-1.2)))/.21)**2)*(1-u*.6);
        additions=[a*20+b*4+ribbon*3,a*32+b*10+c*5+ribbon*6,a*49+b*17+c*8+ribbon*8];
      }
      // Fixed sub-byte dither reduces banding without temporal noise.
      const dither=(((x*13+y*7)%17)/17-.5)*.5,index=(y*w+x)*4;
      for(let k=0;k<3;k++)data[index+k]=BASE[k]+additions[k]+dither;
      data[index+3]=255;
    }
  }
  context.putImageData(image,0,0);return canvas;
}
