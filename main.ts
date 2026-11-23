// Tiny stack VM (make.fun tiny stack ISA v1), golfed. Semantics are the kit reference VM's
// (generator/subject/vm.mjs), check order included. S: pop counts of opcodes 0..83, '9'=unknown.
import{mkdirSync,readFileSync,readdirSync,writeFileSync}from'node:fs';
const S='000112239999999922222221222122292229999999999999011009999999999912999999999999991101';
const I=process.env.MAKEFUN_INPUT_DIR??'/input',O=process.env.MAKEFUN_OUTPUT_DIR??'/output';
function run(P,N){
  const n=P.length,D=new Int32Array(256),C=new Int32Array(64),M=new Int32Array(256),U=new Uint8Array(65536);
  let s=0,c=0,l=0,i=0,p=0,t=0;
  const E=e=>({stdout:U.slice(0,l),exit:e});
  for(;;){
    if(t>999999)return E(10);
    if(p<0|p>=n)return E(9);
    const o=P[p],m=o==1?1:o==2?4:o>47&o<52?2:0;
    if(!S[o]|S[o]=='9')return E(5);
    if(p+m>=n)return E(9);
    t++;
    if(s<+S[o])return E(2);
    if(s>255&(o==1|o==2|o==4|o==6|o==82))return E(3);
    p+=1+m;
    if(o<8){
      if(!o)return E(0);
      if(o==1)D[s++]=P[p-1]<<24>>24;
      else if(o==2)D[s++]=P[p-4]|P[p-3]<<8|P[p-2]<<16|P[p-1]<<24;
      else if(o==3)s--;
      else if(o==4)D[s]=D[s-1],s++;
      else if(o==5){const v=D[s-1];D[s-1]=D[s-2];D[s-2]=v;}
      else if(o==6)D[s]=D[s-2],s++;
      else{const v=D[s-3];D[s-3]=D[s-2];D[s-2]=D[s-1];D[s-1]=v;}
    }else if(o>15&o<35){
      if(o==23)D[s-1]=-D[s-1]|0;
      else if(o==27)D[s-1]=~D[s-1];
      else{
        const b=D[s-1],a=D[s-2];
        if(o>18&o<23&!b)return E(4);
        s--;
        D[s-1]=o==16?a+b|0:o==17?a-b|0:o==18?Math.imul(a,b):o==19?a/b|0:o==20?a%b|0:o==21?(a>>>0)/(b>>>0)|0
          :o==22?(a>>>0)%(b>>>0)|0:o==24?a&b:o==25?a|b:o==26?a^b:o==28?a<<b:o==29?a>>b:o==30?a>>>b|0
          :o==32?(a==b?1:0):o==33?(a<b?1:0):(a>>>0)<(b>>>0)?1:0;
      }
    }else if(o>47&o<53){
      const r=(P[p-2]|P[p-1]<<8)<<16>>16;
      if(o==51){if(c>63)return E(7);C[c++]=p;p=P[p-2]|P[p-1]<<8;}
      else if(o==52){if(!c)return E(8);p=C[--c];}
      else if(o==48)p+=r;
      else if(o==49?!D[--s]:D[--s])p+=r;
    }else if(o>63&o<66){
      const a=D[s-1];
      if(a<0|a>255)return E(6);
      if(o==64)D[s-1]=M[a];else M[a]=D[s-2],s-=2;
    }else if(o==80){
      const w=''+D[s-1];
      if(l+w.length>65536)return E(11);
      s--;
      for(let k=0;k<w.length;)U[l++]=w.charCodeAt(k++);
    }else if(o==81){
      if(l>65535)return E(11);
      U[l++]=D[--s]&255;
    }else if(o==82)D[s++]=i<N.length?N[i++]:-1;
    else return E(D[--s]&255);
  }
}
for(const id of readdirSync(I)){
  const d=I+'/'+id+'/',e=O+'/'+id+'/';
  let N;
  try{N=readFileSync(d+'input.bin');}catch{N=[];}
  const r=run(readFileSync(d+'program.bin'),N);
  mkdirSync(e,{recursive:true});
  writeFileSync(e+'stdout.bin',r.stdout);
  writeFileSync(e+'exit.txt',r.exit+'\n');
}
