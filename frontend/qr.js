// Self-contained QR encoder for version 5-L (37x37, up to 106 UTF-8 bytes).
// Binary mode + Reed–Solomon ECC; no external runtime requests or dependencies.
function mul(x,y){let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z&0x80)?0x11d:0);z^=((y>>>i)&1)?x:0;}return z;}
function exp(n){let v=1;for(let i=0;i<n;i++)v=mul(v,2);return v;}
function ecc26(data){let poly=[1];for(let i=0;i<26;i++){const out=Array(poly.length+1).fill(0);for(let j=0;j<poly.length;j++){out[j]^=poly[j];out[j+1]^=mul(poly[j],exp(i));}poly=out;}
 const rem=Array(26).fill(0);for(const b of data){const f=b^rem.shift();rem.push(0);for(let i=0;i<26;i++)rem[i]^=mul(poly[i+1],f);}return rem;
}
export function qrMatrix(value){
 const bytes=Array.from(new TextEncoder().encode(value));if(bytes.length>106)throw Error('Join URL is too long for the built-in QR encoder. Use the room code instead.');
 const bits=[];function add(v,n){for(let i=n-1;i>=0;i--)bits.push((v>>>i)&1);}
 add(4,4);add(bytes.length,8);for(const b of bytes)add(b,8);
 for(let i=0;i<4&&bits.length<864;i++)bits.push(0);
 while(bits.length%8)bits.push(0);
 const data=[];for(let i=0;i<bits.length;i+=8){let v=0;for(let j=0;j<8;j++)v=(v<<1)|bits[i+j];data.push(v);}
 let pad=0;while(data.length<108)data.push(pad++%2===0?0xec:0x11);
 const coded=[...data,...ecc26(data)];const size=37;
 const matrix=Array.from({length:size},()=>Array(size).fill(false)),fixed=Array.from({length:size},()=>Array(size).fill(false));
 function set(x,y,dark){if(x<0||y<0||x>=size||y>=size)return;matrix[y][x]=!!dark;fixed[y][x]=true;}
 for(const [cx,cy] of [[3,3],[size-4,3],[3,size-4]]){
  for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
   const dist=Math.max(Math.abs(dx),Math.abs(dy));set(cx+dx,cy+dy,dist!==2&&dist!==4);
  }
 }
 for(let i=8;i<size-8;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
 for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(30+dx,30+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
 // Reserve then draw format information for ECL L, fixed mask 0.
 let f=(1<<3),r=f;for(let i=0;i<10;i++)r=(r<<1)^(((r>>>9)&1)?0x537:0);
 const fb=((f<<10)|r)^0x5412;const bit=i=>(fb>>>i)&1;
 for(let i=0;i<=5;i++)set(8,i,bit(i));set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));
 for(let i=9;i<15;i++)set(14-i,8,bit(i));
 for(let i=0;i<8;i++)set(size-1-i,8,bit(i));for(let i=8;i<15;i++)set(8,size-15+i,bit(i));set(8,size-8,true);
 let pos=0;for(let right=size-1;right>=1;right-=2){if(right===6)right=5;
  for(let vert=0;vert<size;vert++){const y=((right+1)&2)===0?size-1-vert:vert;
   for(let j=0;j<2;j++){const x=right-j;if(fixed[y][x])continue;
    const b=pos<coded.length*8?(coded[pos>>>3]>>>(7-(pos&7)))&1:0;
    matrix[y][x]=!!(b^(((x+y)%2===0)?1:0));pos++;
   }
  }
 }
 return matrix;
}
export function qrSVG(value){const mat=qrMatrix(value),d=[];
 for(let y=0;y<mat.length;y++)for(let x=0;x<mat.length;x++)if(mat[y][x])d.push(`M${x+4} ${y+4}h1v1h-1z`);
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" role="img" aria-label="QR code to join the room"><rect width="45" height="45" fill="#f3ead8"/><path fill="#181715" d="${d.join('')}"/></svg>`;
}
