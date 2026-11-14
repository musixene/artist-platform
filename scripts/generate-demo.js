// Original synthesized tones; no recordings, external samples, or personal data.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../apps/server/database.js';
import { importTrack } from './import-track.js';
const dataDir = process.env.DATA_DIR || 'data';
const db = openDatabase(dataDir);
const existing = new Set(db.prepare('SELECT title FROM tracks').all().map(row => row.title)); db.close();
const temporary = mkdtempSync(join(tmpdir(), 'musixene-demo-'));
try {
  for (const [title, frequency] of [['Morning signal', 220], ['Small hours', 174.61], ['Open horizon', 261.63]]) {
    if (existing.has(title)) { console.log(`Already present: ${title}`); continue; }
    const rate = 22050, seconds = 18, samples = rate * seconds;
    const output = Buffer.alloc(44 + samples * 2);
    output.write('RIFF'); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ',8);
    output.writeUInt32LE(16,16); output.writeUInt16LE(1,20); output.writeUInt16LE(1,22);
    output.writeUInt32LE(rate,24); output.writeUInt32LE(rate*2,28); output.writeUInt16LE(2,32); output.writeUInt16LE(16,34);
    output.write('data',36); output.writeUInt32LE(samples*2,40);
    for (let i=0; i<samples; i++) {
      const t=i/rate, envelope=Math.min(1,t/1.5,(seconds-t)/2);
      const signal=(Math.sin(2*Math.PI*frequency*t)+0.35*Math.sin(2*Math.PI*frequency*1.5*t)+0.18*Math.sin(2*Math.PI*frequency*2*t))*0.12*envelope;
      output.writeInt16LE(Math.round(signal*32767),44+i*2);
    }
    const source=join(temporary, `${frequency}.wav`); writeFileSync(source,output);
    importTrack({source,title,artist:'Musixene · synthetic demo',dataDir}); console.log(`Generated: ${title}`);
  }
} finally { rmSync(temporary,{recursive:true,force:true}); }
