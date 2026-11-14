import { copyFileSync, mkdirSync, openSync, readSync, closeSync, statSync, chmodSync, unlinkSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openDatabase } from '../apps/server/database.js';
export function importTrack({ source, title, artist, dataDir = process.env.DATA_DIR || 'data' }) {
  if (!source || !title?.trim() || !artist?.trim() || title.length > 200 || artist.length > 100) throw new Error('Provide source, title (up to 200 characters), artist (up to 100)');
  const ext = extname(source).toLowerCase();
  const types = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg' };
  if (!types[ext]) throw new Error('Supported extensions: .wav .mp3 .m4a .ogg; browser codec support varies');
  const size = statSync(source).size;
  if (size < 12 || size > 512 * 1024 * 1024) throw new Error('Audio must be between 12 bytes and 512 MiB');
  const header = Buffer.alloc(16), fd = openSync(source, 'r');
  try { readSync(fd, header, 0, 16, 0); } finally { closeSync(fd); }
  const signature = ext === '.wav' ? header.toString('ascii',0,4) === 'RIFF' && header.toString('ascii',8,12) === 'WAVE'
    : ext === '.ogg' ? header.toString('ascii',0,4) === 'OggS'
    : ext === '.m4a' ? header.toString('ascii',4,8) === 'ftyp'
    : header.toString('ascii',0,3) === 'ID3' || (header[0] === 255 && (header[1] & 224) === 224);
  if (!signature) throw new Error('File signature does not match extension; import trusted audio only');
  const directory = resolve(dataDir), db = openDatabase(directory), id = randomUUID(), filename = `${id}${ext}`;
  mkdirSync(join(directory, 'media'), { recursive: true, mode: 0o700 });
  const target = join(directory, 'media', filename);
  try {
    copyFileSync(source, target); chmodSync(target, 0o600);
    db.prepare('INSERT INTO tracks VALUES (?, ?, ?, ?, ?, ?)').run(id, title.trim(), artist.trim(), filename, types[ext], Date.now());
  } catch (error) { try { unlinkSync(target); } catch {} throw error; }
  finally { db.close(); }
  return id;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, title, artist] = process.argv.slice(2);
  try { console.log(importTrack({ source, title, artist })); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
