import { 
  waitForEvenAppBridge, 
  CreateStartUpPageContainer, 
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
  TextContainerUpgrade
} from '@evenrealities/even_hub_sdk';

// --- CONFIG ---
// !!! IMPORTANT: Replace 127.0.0.1 with your MacBook IP (e.g., 192.168.1.XX) !!!
const CLIENT_ID = '0dac788532204ec9aed1b36ea9a20f0d';
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

// ================= THE "HTTP-FRIENDLY" CRYPTO FIX =================

/**
 * A pure JS SHA-256 implementation that works on non-secure contexts (HTTP/IP).
 * This replaces the broken window.crypto.subtle.digest call.
 */
function sha256_fallback(ascii: string): Uint8Array {
  function r(n: number, x: number) { return (x >>> n) | (x << (32 - n)); }
  let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  let k = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  let b = new Uint32Array(64), words = new Uint32Array(ascii.length + 8 >> 2);
  for (let i = 0; i < ascii.length; i++) words[i >> 2] |= ascii.charCodeAt(i) << (24 - (i % 4) * 8);
  words[ascii.length >> 2] |= 0x80 << (24 - (ascii.length % 4) * 8);
  words[words.length - 1] = ascii.length * 8;
  for (let i = 0; i < words.length; i += 16) {
    for (let j = 0; j < 16; j++) b[j] = words[i + j];
    for (let j = 16; j < 64; j++) {
      let s0 = r(7, b[j - 15]) ^ r(18, b[j - 15]) ^ (b[j - 15] >>> 3);
      let s1 = r(17, b[j - 2]) ^ r(19, b[j - 2]) ^ (b[j - 2] >>> 10);
      b[j] = (b[j - 16] + s0 + b[j - 7] + s1) | 0;
    }
    let [A, B, C, D, E, F, G, H] = h;
    for (let j = 0; j < 64; j++) {
      let T1 = (H + (r(6, E) ^ r(11, E) ^ r(25, E)) + ((E & F) ^ (~E & G)) + k[j] + b[j]) | 0;
      let T2 = ((r(2, A) ^ r(13, A) ^ r(22, A)) + ((A & B) ^ (A & C) ^ (B & C))) | 0;
      [H, G, F, E, D, C, B, A] = [G, F, E, (D + T1) | 0, C, B, A, (T1 + T2) | 0];
    }
    h[0] = (h[0] + A) | 0; h[1] = (h[1] + B) | 0; h[2] = (h[2] + C) | 0; h[3] = (h[3] + D) | 0;
    h[4] = (h[4] + E) | 0; h[5] = (h[5] + F) | 0; h[6] = (h[6] + G) | 0; h[7] = (h[7] + H) | 0;
  }
  const result = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    result[i * 4] = (h[i] >>> 24) & 0xff;
    result[i * 4 + 1] = (h[i] >>> 16) & 0xff;
    result[i * 4 + 2] = (h[i] >>> 8) & 0xff;
    result[i * 4 + 3] = h[i] & 0xff;
  }
  return result;
}

// ================= AUTH & SESSION =================

const logout = () => {
  localStorage.removeItem('spotify_token');
  localStorage.removeItem('code_verifier');
  window.location.href = REDIRECT_URI;
};

const generateRandomString = (l: number) => {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const v = crypto.getRandomValues(new Uint8Array(l));
  return v.reduce((a, x) => a + c[x % c.length], '');
};

async function redirectToSpotify() {
  const v = generateRandomString(64);
  localStorage.setItem('code_verifier', v);

  // USING THE FALLBACK HASH HERE
  const hashed = sha256_fallback(v);
  
  // Base64Url encode
  const challenge = btoa(String.fromCharCode(...hashed))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const p = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, scope: SCOPES,
    code_challenge_method: 'S256', code_challenge: challenge, redirect_uri: REDIRECT_URI,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${p.toString()}`;
}

async function exchangeCode(code: string) {
  const v = localStorage.getItem('code_verifier') || '';
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, grant_type: 'authorization_code',
      code, redirect_uri: REDIRECT_URI, code_verifier: v
    })
  });
  const data = await r.json();
  if (data.access_token) localStorage.setItem('spotify_token', data.access_token);
  return data.access_token;
}

// ================= UI RENDERING (G2 GLASSES) =================

const formatTime = (ms: number) => {
  const s = Math.floor((ms / 1000) % 60);
  const m = Math.floor((ms / (1000 * 60)) % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

async function updateGlassesUI(bridge: any) {
  const token = localStorage.getItem('spotify_token');
  
  let displayContent = "";
  if (!token) {
    displayContent = "\n  Spotify Disconnected\n  Sign in on phone";
  } else {
    if (trackData.isPlaying && trackData.progressMs < trackData.durationMs) {
      trackData.progressMs += 1000;
    }
    const timeStr = `${formatTime(trackData.progressMs)} / ${formatTime(trackData.durationMs)}`;
    displayContent = `\n  ${trackData.name}\n  ${trackData.artist} - ${timeStr}`;
  }

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
          itemCount: 4,
          itemName: ['PLAY', 'PAUSE', 'NEXT', 'PREV'],
          isItemSelectBorderEn: 1
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

// ================= WEB UI =================

function renderWebUI(isLoggedIn: boolean) {
  const appRoot = document.body;
  appRoot.style.backgroundColor = '#121212';
  appRoot.style.color = 'white';
  appRoot.style.fontFamily = 'sans-serif';
  appRoot.style.margin = '0';
  appRoot.style.height = '100vh';
  appRoot.style.display = 'flex';
  appRoot.style.flexDirection = 'column';

  if (!isLoggedIn) {
    appRoot.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding: 20px;">
        <h1 style="font-size: 48px; margin-bottom: 10px;">G2 Spotify</h1>
        <p style="color: #b3b3b3; margin-bottom: 30px;">Control your music from your vision.</p>
        <button id="login-btn" style="padding:16px 48px; background:#1DB954; color:white; border-radius:30px; border:none; font-weight:bold; font-size:16px; cursor:pointer;">
          CONNECT WITH SPOTIFY
        </button>
      </div>
    `;
    document.getElementById('login-btn')?.addEventListener('click', redirectToSpotify);
  } else {
    appRoot.innerHTML = `
      <nav style="padding: 20px 40px; background: #000; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333;">
        <span style="font-weight: bold; font-size: 20px; color: #1DB954;">G2 Active</span>
        <button id="logout-btn" style="background: transparent; color: #b3b3b3; border: 1px solid #b3b3b3; padding: 8px 16px; border-radius: 20px; cursor: pointer;">
          SIGN OUT
        </button>
      </nav>
      <div style="flex:1; display:flex; justify-content:center; align-items:center; flex-direction:column;">
        <div id="web-track-info" style="background: #181818; padding: 40px; border-radius: 12px; border: 1px solid #282828; min-width: 300px;">
          <h2 id="web-track-name" style="margin:0 0 8px 0;">Syncing...</h2>
          <p id="web-track-artist" style="color: #b3b3b3; margin:0;">Open Spotify to start</p>
        </div>
      </div>
    `;
    document.getElementById('logout-btn')?.addEventListener('click', logout);
  }
}

// ================= MAIN APP LOGIC =================

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
        const nameEl = document.getElementById('web-track-name');
        const artistEl = document.getElementById('web-track-artist');
        if (nameEl && artistEl) {
          nameEl.innerText = trackData.name;
          artistEl.innerText = trackData.artist;
        }
      }
    } else if (res.status === 401) {
      logout();
    }
  } catch (e) { console.error(e); }
}

async function startApp() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  let token = localStorage.getItem('spotify_token');

  if (code && !token) {
    token = await exchangeCode(code);
    window.history.replaceState({}, '', window.location.pathname);
  }

  renderWebUI(!!token);

  try {
    const bridge = await waitForEvenAppBridge();
    setInterval(() => updateGlassesUI(bridge), 1000);

    if (token) {
      await syncSpotify(token);
      setInterval(() => syncSpotify(token!), 5000);

      bridge.onEvenHubEvent((e) => {
        if (e.listEvent && typeof e.listEvent.currentSelectItemIndex === 'number') {
          const cmds: any[] = ['play', 'pause', 'next', 'previous'];
          const type = cmds[e.listEvent.currentSelectItemIndex];
          if (type) {
             const method = (type === 'next' || type === 'previous') ? 'POST' : 'PUT';
             fetch(`https://api.spotify.com/v1/me/player/${type}`, { 
               method,
               headers: { Authorization: `Bearer ${token}` } 
             }).then(() => setTimeout(() => syncSpotify(token!), 600));
          }
        }
      });
    }
  } catch (e) { console.error(e); }
}

window.addEventListener('load', startApp);