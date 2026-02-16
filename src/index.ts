import { 
  waitForEvenAppBridge, 
  CreateStartUpPageContainer, 
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
  TextContainerUpgrade
} from '@evenrealities/even_hub_sdk';

// --- CONFIG ---
const CLIENT_ID = '0dac788532204ec9aed1b36ea9a20f0d';
// ENSURE THIS MATCHES YOUR CURRENT TEST ENVIRONMENT (LOCAL OR GITHUB)
const REDIRECT_URI = "https://tomgood18.github.io/g2-spotify/"; 
const SCOPES = 'user-modify-playback-state user-read-playback-state user-read-currently-playing';

// --- STATE ---
let isFirstRender = true;
let trackData = {
  name: "Loading...",
  artist: "Spotify",
  progressMs: 0,
  durationMs: 0,
  isPlaying: false
};

// ================= AUTH UTILS (NATIVE CRYPTO) =================

const generateRandomString = (length: number) => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
};

const sha256 = async (plain: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
};

const base64urlencode = (a: ArrayBuffer) => {
  return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(a))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const logout = () => {
  localStorage.removeItem('spotify_token');
  localStorage.removeItem('code_verifier');
  window.location.href = REDIRECT_URI;
};

// ================= AUTH FLOW =================

async function redirectToSpotify() {
  const verifier = generateRandomString(64);
  localStorage.setItem('code_verifier', verifier);

  const hashed = await sha256(verifier);
  const challenge = base64urlencode(hashed);

  const p = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    redirect_uri: REDIRECT_URI,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${p.toString()}`;
}

async function exchangeCode(code: string) {
  const verifier = localStorage.getItem('code_verifier');
  if (!verifier) return null;

  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier
    })
  });

  const data = await r.json();
  if (data.access_token) {
    localStorage.setItem('spotify_token', data.access_token);
    localStorage.removeItem('code_verifier');
    return data.access_token;
  }
  console.error("Exchange Failed:", data);
  return null;
}

// ================= UI & SYNC =================

const formatTime = (ms: number) => {
  const s = Math.floor((ms / 1000) % 60);
  const m = Math.floor((ms / (1000 * 60)) % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

async function updateGlassesUI(bridge: any) {
  const token = localStorage.getItem('spotify_token');
  if (!token) return;

  if (trackData.isPlaying && trackData.progressMs < trackData.durationMs) {
    trackData.progressMs += 1000;
  }
  const timeStr = `${formatTime(trackData.progressMs)} / ${formatTime(trackData.durationMs)}`;
  const displayContent = `\n  ${trackData.name}\n  ${trackData.artist} - ${timeStr}`;

  try {
    if (isFirstRender) {
      const textObj = TextContainerProperty.fromJson({
        xPosition: 10, yPosition: 10, width: 556, height: 90, 
        containerID: 1, containerName: 'info-bar',
        content: displayContent, isEventCapture: 0,
        borderWidth: 1, borderColor: 7
      });
      const listObj = ListContainerProperty.fromJson({
        xPosition: 10, yPosition: 105, width: 556, height: 175, 
        containerID: 2, containerName: 'ctrl-list',
        itemContainer: ListItemContainerProperty.fromJson({
          itemCount: 4, itemName: ['PLAY', 'PAUSE', 'NEXT', 'PREV'], isItemSelectBorderEn: 1
        }),
        isEventCapture: 1
      });
      await bridge.createStartUpPageContainer(CreateStartUpPageContainer.fromJson({
        containerTotalNum: 2, textObject: [textObj], listObject: [listObj]
      }));
      isFirstRender = false;
    } else {
      await bridge.textContainerUpgrade(TextContainerUpgrade.fromJson({
        containerID: 1, containerName: 'info-bar', content: displayContent
      }));
    }
  } catch (e) { console.error(e); }
}

function renderWebUI(isLoggedIn: boolean) {
  document.body.style.backgroundColor = '#121212';
  document.body.style.color = 'white';
  document.body.style.fontFamily = 'sans-serif';
  
  if (!isLoggedIn) {
    document.body.innerHTML = `
      <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh;">
        <h1>G2 Spotify</h1>
        <button id="login-btn" style="padding:16px 48px; background:#1DB954; color:white; border-radius:30px; border:none; font-weight:bold; cursor:pointer;">
          CONNECT WITH SPOTIFY
        </button>
      </div>`;
    document.getElementById('login-btn')?.addEventListener('click', redirectToSpotify);
  } else {
    document.body.innerHTML = `
      <div style="padding: 20px;">
        <h2 id="web-track-name">Syncing...</h2>
        <p id="web-track-artist">Open Spotify to start</p>
        <button id="logout-btn">Sign Out</button>
      </div>`;
    document.getElementById('logout-btn')?.addEventListener('click', logout);
  }
}

async function syncSpotify(token: string) {
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 200) {
      const data = await res.json();
      if (data.item) {
        trackData = {
          name: data.item.name,
          artist: data.item.artists[0].name,
          progressMs: data.progress_ms,
          durationMs: data.item.duration_ms,
          isPlaying: data.is_playing
        };
        const n = document.getElementById('web-track-name');
        const a = document.getElementById('web-track-artist');
        if (n && a) { n.innerText = trackData.name; a.innerText = trackData.artist; }
      }
    }
  } catch (e) { console.error(e); }
}

async function startApp() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  let token = localStorage.getItem('spotify_token');

  if (code && !token) {
    token = await exchangeCode(code);
    if (token) {
      window.location.href = REDIRECT_URI;
      return;
    }
  }

  renderWebUI(!!token);

  if (token) {
    try {
      const bridge = await waitForEvenAppBridge();
      setInterval(() => updateGlassesUI(bridge), 1000);
      await syncSpotify(token);
      setInterval(() => syncSpotify(token), 5000);
      
      bridge.onEvenHubEvent((e: any) => {
        if (e.listEvent) {
          const cmds = ['play', 'pause', 'next', 'previous'];
          const type = cmds[e.listEvent.currentSelectItemIndex];
          const method = (type === 'next' || type === 'previous') ? 'POST' : 'PUT';
          fetch(`https://api.spotify.com/v1/me/player/${type}`, {
            method, headers: { Authorization: `Bearer ${token}` }
          }).then(() => setTimeout(() => syncSpotify(token), 600));
        }
      });
    } catch (e) { console.error("Bridge Error:", e); }
  }
}

window.addEventListener('load', startApp);