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
const REDIRECT_URI = window.location.origin + window.location.pathname;
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

// ================= AUTH UTILS =================

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
  document.body.style.margin = '0';
  document.body.style.backgroundColor = '#121212';
  document.body.style.color = 'white';
  document.body.style.fontFamily = 'sans-serif';
  document.body.style.display = 'flex';
  document.body.style.flexDirection = 'column';
  document.body.style.minHeight = '100vh';

  if (!isLoggedIn) {
    document.body.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding: 20px;">
        <h1>G2 Spotify</h1>
        <button id="login-btn" style="padding:15px 30px; background:#1DB954; color:white; border-radius:30px; border:none; font-weight:bold; cursor:pointer;">
          CONNECT SPOTIFY
        </button>
      </div>`;
    document.getElementById('login-btn')?.addEventListener('click', redirectToSpotify);
  } else {
    document.body.innerHTML = `
      <nav style="padding: 20px; display: flex; justify-content: space-between;">
        <span style="color:#1DB954">G2 ACTIVE</span>
        <button id="logout-btn">Sign Out</button>
      </nav>
      <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center;">
        <h2 id="web-track-name">Syncing...</h2>
        <p id="web-track-artist"></p>
        <div style="width: 200px; height: 4px; background: #333; margin-top:10px;">
          <div id="web-progress-bar" style="width: 0%; height: 100%; background: #1DB954;"></div>
        </div>
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
        const p = document.getElementById('web-progress-bar');
        if (n && a) { n.innerText = trackData.name; a.innerText = trackData.artist; }
        if (p) { p.style.width = `${(trackData.progressMs / trackData.durationMs) * 100}%`; }
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
    if (token) window.history.replaceState({}, '', REDIRECT_URI);
  }

  renderWebUI(!!token);

  if (token) {
    try {
      const bridge = await waitForEvenAppBridge();
      setInterval(() => updateGlassesUI(bridge), 1000);
      await syncSpotify(token);
      setInterval(() => syncSpotify(token!), 5000);
      
      bridge.onEvenHubEvent((e: any) => {
        let index = e.listEvent?.currentSelectItemIndex;
        if (index === undefined && e.jsonData) {
            const parsed = typeof e.jsonData === 'string' ? JSON.parse(e.jsonData) : e.jsonData;
            index = parsed.currentSelectItemIndex;
        }

        if (typeof index === 'number') {
          const cmds = ['play', 'pause', 'next', 'previous'];
          const type = cmds[index];
          if (type) {
            const isControl = (type === 'play' || type === 'pause');
            const method = isControl ? 'PUT' : 'POST';
            
            // ACTUAL SPOTIFY API ENDPOINTS
            fetch(`https://api.spotify.com/v1/me/player/${type}`, {
              method,
              headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json' 
              },
              body: isControl ? JSON.stringify({}) : null
            }).then(() => setTimeout(() => syncSpotify(token!), 600));
          }
        }
      });
    } catch (e) { console.error(e); }
  }
}

window.addEventListener('load', startApp);