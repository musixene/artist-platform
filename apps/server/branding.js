/*
 * The contents of this file are subject to the Common Public Attribution License Version 1.0
 * (CPAL-1.0); you may not use this file except in compliance with the License.
 * Obtain the License at https://opensource.org/license/CPAL-1.0 or see LICENSE.
 * The License is based on MPL 1.1; CPAL Sections 14 and 15 address attribution and network use.
 * Software distributed under the License is supplied AS IS, WITHOUT WARRANTY OF ANY KIND.
 * Original Code: Musixene Artist Platform.
 * Original and Initial Developer: Musixene (a trade name of Clara Vista Entertainment LLC).
 * Portions written by Musixene: Copyright (c) 2026 Musixene. All Rights Reserved.
 */
import { inflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
const fail = message => Object.assign(new Error(message),{status:400});
function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
// Branding accepts bounded, non-interlaced 8-bit PNGs, not active SVG/HTML or arbitrary files.
export function validateBrandingPNG(data,kind) {
  if(data.length<45 || data.length>2*1024*1024 || !data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw fail('Upload a PNG image up to 2 MiB');
  let offset=8,width,height,channels,ended=false,seenData=false,closedData=false;const compressed=[];
  while(offset<data.length){
    if(offset+12>data.length)throw fail('Invalid PNG chunks');
    const length=data.readUInt32BE(offset),type=data.toString('ascii',offset+4,offset+8),end=offset+12+length;
    if(end>data.length || !/^[A-Za-z]{4}$/.test(type) || crc32(data.subarray(offset+4,end-4))!==data.readUInt32BE(end-4))throw fail('Invalid PNG checksum');
    const chunk=data.subarray(offset+8,end-4);
    if(offset===8 && type!=='IHDR')throw fail('PNG header required');
    if(type==='IHDR'){
      if(width!==undefined || length!==13)throw fail('Invalid PNG header');
      width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);channels=chunk[9]===6?4:chunk[9]===2?3:0;
      if(!width||!height||width>2048||height>2048||chunk[8]!==8||!channels||chunk[10]||chunk[11]||chunk[12])throw fail('Use a non-interlaced 8-bit RGB or RGBA PNG, at most 2048×2048');
      const square=width===height;
      if(kind==='logo'&&(width<64||height<32||height>1024))throw fail('Logo must be 64–2048 pixels wide and 32–1024 pixels high');
      if(kind==='favicon'&&(!square||width<32||width>256))throw fail('Favicon must be square, 32–256 pixels');
      if(kind==='icon192'&&(!square||width!==192))throw fail('Small PWA icon must be 192×192');
      if(kind==='icon512'&&(!square||width!==512))throw fail('PWA icon must be 512×512');
    }else if(type==='IDAT'){
      if(closedData)throw fail('Invalid PNG data order');seenData=true;compressed.push(chunk);
    }else{
      if(seenData)closedData=true;
      if(type==='IEND'){if(length||!seenData||end!==data.length)throw fail('Invalid PNG end');ended=true;offset=end;break;}
      if(type[0]===type[0].toUpperCase()&&!['PLTE'].includes(type))throw fail('Unsupported critical PNG chunk');
    }
    offset=end;
  }
  if(!ended)throw fail('Incomplete PNG');
  const expected=(width*channels+1)*height;let pixels;
  try{pixels=inflateSync(Buffer.concat(compressed),{maxOutputLength:expected});}catch{throw fail('Invalid PNG pixel data');}
  if(pixels.length!==expected)throw fail('Invalid PNG pixel size');
  for(let row=0;row<height;row++)if(pixels[row*(width*channels+1)]>4)throw fail('Invalid PNG row filter');
  return {width,height};
}
export const brandingKinds=['logo','favicon','icon192','icon512'];
export async function brandingAsset(dataDir,value) {
  if(typeof value!=='string'||basename(value)!==value||!/^[-a-f0-9]+\.png$/.test(value))return null;
  return readFile(join(dataDir,'branding',value)).catch(()=>null);
}
export function brandingURL(kind,value) {return value?`/branding/${kind}?v=${encodeURIComponent(value)}`:null;}
