import { nextIndex } from './player.js';
const $ = id => document.getElementById(id);
const audio = $('audio');
let csrf = '', tracks = [], current = -1, shuffle = false, repeat = 'off', register = false, registrationAllowed = true;
function message(text = '') { $('message').textContent = text; }
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: response.status });
  return data;
}
function signedOut() {
  csrf = ''; register = false;
  $('auth-title').textContent = 'Come on in.'; $('auth-submit').textContent = 'Sign in';
  $('auth-toggle').textContent = 'New here? Create a listener account'; $('password').autocomplete = 'current-password';
  audio.pause(); audio.removeAttribute('src'); audio.load();
  if ('mediaSession' in navigator) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; }
  tracks = []; current = -1; $('tracks').replaceChildren();
  $('library').hidden = $('logout').hidden = $('player').hidden = true; $('auth').hidden = false; $('identity').textContent = '';
}
async function signedIn(data) {
  csrf = data.csrf;
  $('auth').hidden = true; $('library').hidden = $('logout').hidden = false;
  $('identity').textContent = data.user.username;
  tracks = (await api('/api/tracks')).tracks;
  $('track-count').textContent = `${tracks.length} tracks`;
  $('empty').hidden = tracks.length > 0;
  $('tracks').replaceChildren(...tracks.map((track, index) => {
    const li = document.createElement('li'), button = document.createElement('button');
    button.className = 'track'; button.dataset.index = index;
    const number = document.createElement('span'); number.className = 'track-index'; number.textContent = String(index + 1).padStart(2, '0');
    const info = document.createElement('span'), title = document.createElement('strong'), artist = document.createElement('small'), action = document.createElement('span');
    title.textContent = track.title; artist.textContent = track.artist; action.textContent = 'Play'; action.className = 'track-action'; action.setAttribute('aria-hidden', 'true');
    info.append(title, artist); button.append(number, info, action); button.addEventListener('click', () => selectTrack(index)); li.append(button); return li;
  }));
}
function updatePosition() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  $('seek').max = duration; $('seek').value = audio.currentTime; $('seek').disabled = !duration;
  const time = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  $('elapsed').textContent = time(audio.currentTime); $('duration').textContent = time(duration);
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && duration > 0) {
    try { navigator.mediaSession.setPositionState({ duration, playbackRate: audio.playbackRate, position: Math.min(duration, audio.currentTime) }); } catch { /* Optional browser capability. */ }
  }
}
async function play() {
  if (current < 0) return;
  try { await audio.play(); message(); } catch { message('Playback could not start. Tap play to retry; check your connection and sign-in.'); }
}
function selectTrack(index) {
  if (!tracks[index]) return;
  current = index; const track = tracks[index];
  // Keep the same audio element alive across track selections and UI updates.
  audio.src = `/api/tracks/${encodeURIComponent(track.id)}/audio`;
  $('player').hidden = false; $('now-title').textContent = track.title; $('now-artist').textContent = track.artist;
  document.querySelectorAll('.track').forEach(button => button.setAttribute('aria-current', String(Number(button.dataset.index) === index)));
  if ('mediaSession' in navigator && 'MediaMetadata' in window) navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, artwork: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] });
  play();
}
function advance(direction = 1, ended = false) {
  const index = nextIndex({ length: tracks.length, current, direction, shuffle, repeat, ended });
  if (index >= 0) selectTrack(index);
}
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault(); $('auth-submit').disabled = true; message();
  try {
    const data = await api(register ? '/api/register' : '/api/login', { method: 'POST', body: JSON.stringify({ username: $('username').value, password: $('password').value }) });
    $('password').value = ''; await signedIn(data);
  } catch (error) { message(error.message); } finally { $('auth-submit').disabled = false; }
});
$('auth-toggle').addEventListener('click', () => {
  if (!registrationAllowed) return;
  register = !register;
  $('auth-title').textContent = register ? 'Your space to listen.' : 'Come on in.';
  $('auth-submit').textContent = register ? 'Create listener account' : 'Sign in';
  $('auth-toggle').textContent = register ? 'Already here? Sign in' : 'New here? Create a listener account';
  $('password').autocomplete = register ? 'new-password' : 'current-password'; message();
});
$('logout').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST', body: '{}' }); signedOut(); message('Signed out.'); } catch (error) { message(error.message); }
});
$('play').addEventListener('click', () => audio.paused ? play() : audio.pause());
$('next').addEventListener('click', () => advance());
$('previous').addEventListener('click', () => { if (audio.currentTime > 3) audio.currentTime = 0; else advance(-1); });
$('shuffle').addEventListener('click', () => { shuffle = !shuffle; $('shuffle').setAttribute('aria-pressed', String(shuffle)); });
$('repeat').addEventListener('click', () => {
  repeat = { off: 'all', all: 'one', one: 'off' }[repeat];
  $('repeat').setAttribute('aria-label', `Repeat ${repeat}`); $('repeat').setAttribute('aria-pressed', String(repeat !== 'off')); $('repeat').textContent = repeat === 'one' ? '↻1' : '↻';
});
$('seek').addEventListener('input', () => { if (Number.isFinite(audio.duration)) audio.currentTime = Number($('seek').value); });
$('volume').addEventListener('input', () => { audio.volume = Number($('volume').value); });
audio.addEventListener('ended', () => advance(1, true));
audio.addEventListener('play', () => { $('play').textContent = 'Ⅱ'; $('play').setAttribute('aria-label', 'Pause'); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
audio.addEventListener('pause', () => { $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Play'); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
audio.addEventListener('error', () => { if (audio.getAttribute('src')) message('Audio unavailable. Check your connection or sign in again, then select the track to retry.'); });
for (const event of ['timeupdate', 'loadedmetadata', 'durationchange', 'seeked']) audio.addEventListener(event, updatePosition);
if ('mediaSession' in navigator) {
  const seek = offset => { if (Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + offset)); };
  const actions = { play, pause: () => audio.pause(), previoustrack: () => advance(-1), nexttrack: () => advance(), seekbackward: details => seek(-(details.seekOffset || 10)), seekforward: details => seek(details.seekOffset || 10), seekto: details => { if (Number.isFinite(audio.duration) && Number.isFinite(details.seekTime)) audio.currentTime = Math.max(0, Math.min(audio.duration, details.seekTime)); }, stop: () => { audio.pause(); audio.currentTime = 0; } };
  for (const [action, handler] of Object.entries(actions)) try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Unsupported actions do not disable others. */ }
}
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('install').hidden = false; });
$('install').addEventListener('click', async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $('install').hidden = true; } });
window.addEventListener('appinstalled', () => { $('install').hidden = true; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => message('App installation support is unavailable; browser playback still works.'));
async function boot() {
  try {
    const config = await api('/api/config');
    $('brand').textContent = config.name; $('tagline').textContent = config.tagline; document.title = `${config.name} · Listening room`;
    registrationAllowed = config.registration; $('auth-toggle').hidden = !registrationAllowed;
    // The server supplies validated branding through same-origin theme.css.
    try { await signedIn(await api('/api/me')); } catch (error) { if (error.status === 401) signedOut(); else throw error; }
  } catch (error) { message(error.message); }
}
boot();
