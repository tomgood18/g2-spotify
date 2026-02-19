import { 
  waitForEvenAppBridge, 
  CreateStartUpPageContainer, 
  TextContainerProperty, 
  ListContainerProperty, 
  ListItemContainerProperty, 
  RebuildPageContainer 
} from '@evenrealities/even_hub_sdk';

// --- CONFIG ---
const CLIENT_ID = '0dac788532204ec9aed1b36ea9a20f0d';
const REDIRECT_URI = window.location.origin + window.location.pathname;
const SCOPES = 'user-modify-playback-state user-read-playback-state user-read-currently-playing';

// --- STATE ---
let isFirstRender = true;
let isSubMenu = false; 
let deviceList: any[] = [];
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

async function redirectToSpotify() {
  const verifier = generateRandomString(64);
  localStorage.setItem('code_verifier', verifier);
  const hashed = await sha256(verifier);
  const challenge = base64urlencode(hashed);
  const p = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, scope: SCOPES,
    code_challenge_method: 'S256', code_challenge: challenge, redirect_uri: REDIRECT_URI,
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
      client_id: CLIENT_ID, grant_type: 'authorization_code',
      code: code, redirect_uri: REDIRECT_URI, code_verifier: verifier
    })
  });
  const data = await r.json();
  if (data.access_token) {
    localStorage.setItem('spotify_token', data.access_token);
    return data.access_token;
  }
  return null;
}

// ================= UI HELPERS =================

const formatTime = (ms: number) => {
  const s = Math.floor((ms / 1000) % 60);
  const m = Math.floor((ms / (1000 * 60)) % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

// Truncation helper for Ellipsis
const truncate = (str: string, len: number) => {
  return str.length > len ? str.substring(0, len - 3) + "..." : str;
};

function getMenuItems() {
  if (isSubMenu) {
    const names = deviceList.length > 0 
      ? deviceList.map(d => truncate((d.name || "DEVICE").toUpperCase(), 15)) 
      : ['NO DEVICES'];
    names.push('BACK');
    return names;
  }
  return ['PLAY', 'PAUSE', 'NEXT', 'PREV', 'DEVICES'];
}

// ================= WEB UI RENDERER =================

function renderWebUI(isLoggedIn: boolean) {
  document.body.style.cssText = "margin:0; padding:0; background-color:#121212; color:white; font-family:'Circular Sp', Helvetica, Arial, sans-serif; display:flex; flex-direction:column; min-height:100vh; overflow:hidden;";
  
  if (!isLoggedIn) {
    document.body.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding: 20px;">
        <h1 style="font-size: 3rem; margin: 0 0 10px 0; letter-spacing: -2px;">G2 Spotify</h1>
        <button id="login-btn" style="padding:18px 48px; background:#1DB954; color:white; border-radius:500px; border:none; font-weight:bold; font-size:1rem; cursor:pointer;">CONNECT WITH SPOTIFY</button>
      </div>`;
    document.getElementById('login-btn')?.addEventListener('click', redirectToSpotify);
  } else {
    document.body.innerHTML = `
      <nav style="padding: 20px 40px; background: #000; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #282828;">
        <span style="font-weight: bold; font-size: 0.8rem; letter-spacing: 1.5px; color: #1DB954;">G2 CONNECTED</span>
        <button id="logout-btn" style="background: transparent; color: #b3b3b3; border: 1px solid #535353; padding: 8px 20px; border-radius: 20px; font-size: 0.8rem; cursor: pointer;">LOGOUT</button>
      </nav>
      <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding: 20px;">
        <div style="background: #181818; padding: 40px; border-radius: 12px; width: 100%; max-width: 400px; border: 1px solid #282828; text-align: left;">
          <div style="color: #b3b3b3; font-size: 0.75rem; font-weight: bold; margin-bottom: 24px; letter-spacing: 2px;">CURRENTLY PLAYING</div>
          <h2 id="web-track-name" style="margin:0; font-size: 2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${trackData.name}</h2>
          <p id="web-track-artist" style="color: #1DB954; margin:8px 0 0 0; font-size: 1.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${trackData.artist}</p>
          <div style="margin-top: 40px;">
             <div style="width: 100%; height: 4px; background: #4f4f4f; border-radius: 2px; overflow: hidden;">
                <div id="web-progress-bar" style="width: 0%; height: 100%; background: #fff; transition: width 0.3s linear;"></div>
             </div>
             <div style="display: flex; justify-content: space-between; color: #b3b3b3; font-size: 0.75rem; margin-top: 8px;">
                <span id="web-p-time">0:00</span>
                <span id="web-d-time">0:00</span>
             </div>
          </div>
        </div>
      </div>`;
    document.getElementById('logout-btn')?.addEventListener('click', logout);
  }
}

// ================= BRIDGE LOGIC =================

async function updateGlassesUI(bridge: any, forcePageRefresh = false) {
  const token = localStorage.getItem('spotify_token');
  if (!token) return;

  // Locally increment progress if playing for smooth 1s updates
  if(trackData.isPlaying && trackData.progressMs < trackData.durationMs) {
    trackData.progressMs += 1000;
    updateWebDisplay(); // Sync Web UI immediately
  }

  const timeStr = `${formatTime(trackData.progressMs)} / ${formatTime(trackData.durationMs)}`;
  const displayContent = `   ${truncate(trackData.name, 25)}\n   ${truncate(trackData.artist, 25)}\n   ${timeStr}`;

  try {
    const menuNames = getMenuItems();

    if (isFirstRender) {
      const textObj = TextContainerProperty.fromJson({
        xPosition: 10, yPosition: 10, width: 550, height: 85, 
        containerID: 1, containerName: 'text_box',
        content: displayContent, isEventCapture: 0, borderWidth: 1, borderColor: 7
      });
      const listObj = ListContainerProperty.fromJson({
        xPosition: 10, yPosition: 100, width: 550, height: 175, 
        containerID: 2, containerName: 'list_box',
        itemContainer: ListItemContainerProperty.fromJson({
          itemCount: menuNames.length, itemName: menuNames, isItemSelectBorderEn: 1
        }),
        isEventCapture: 1
      });
      const container = CreateStartUpPageContainer.fromJson({
        containerTotalNum: 2, textObject: [textObj], listObject: [listObj]
      });
      const res = await bridge.createStartUpPageContainer(container);
      if (res === 0) isFirstRender = false;
    } else if (forcePageRefresh) {
      const textObj = TextContainerProperty.fromJson({
        xPosition: 10, yPosition: 10, width: 550, height: 85, 
        containerID: 1, containerName: 'text_box',
        content: displayContent, isEventCapture: 0, borderWidth: 1, borderColor: 7
      });
      const listObj = ListContainerProperty.fromJson({
        xPosition: 10, yPosition: 100, width: 550, height: 175, 
        containerID: 2, containerName: 'list_box',
        itemContainer: ListItemContainerProperty.fromJson({
          itemCount: menuNames.length, itemName: menuNames, isItemSelectBorderEn: 1
        }),
        isEventCapture: 1
      });
      const container = RebuildPageContainer.fromJson({
        containerTotalNum: 2, textObject: [textObj], listObject: [listObj]
      });
      await bridge.rebuildPageContainer(container);
    } else {
      await bridge.textContainerUpgrade({
        containerID: 1, containerName: 'text_box', content: displayContent
      });
    }
  } catch (e) { console.error(e); }
}

async function startApp() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  let token = localStorage.getItem('spotify_token');

  if (error) { logout(); return; }

  if (code && !token) {
    token = await exchangeCode(code);
    if (token) window.history.replaceState({}, '', REDIRECT_URI);
  }

  renderWebUI(!!token);

  if (token) {
    try {
      const bridge = await waitForEvenAppBridge();
      await syncSpotify(token);
      updateGlassesUI(bridge);

      // Web/Glasses tick every 1 second
      setInterval(() => updateGlassesUI(bridge), 1000);
      // Hard sync with Spotify API every 5 seconds to stay accurate
      setInterval(() => syncSpotify(token!), 5000);

      bridge.onEvenHubEvent(async (e: any) => {
        const source = e.listEvent || (e.jsonData && typeof e.jsonData === 'object' ? e.jsonData : null);
        if (!source) return;
        let idx = source.currentSelectItemIndex ?? 0;

        if (!isSubMenu) {
          const action = ['play', 'pause', 'next', 'previous', 'devices'][idx];
          if (action === 'devices') {
            isSubMenu = true;
            await fetchDevices(token!);
            updateGlassesUI(bridge, true);
          } else if (action) {
            await fetch(`https://api.spotify.com/v1/me/player/${action === 'play' || action === 'pause' ? action : action}`, {
              method: (action === 'play' || action === 'pause') ? 'PUT' : 'POST',
              headers: { Authorization: `Bearer ${token}` }
            });
            setTimeout(() => syncSpotify(token!), 500); // Quick refresh after command
          }
        } else {
          const items = getMenuItems();
          const selected = items[idx];
          if (selected === 'BACK') {
            isSubMenu = false;
          } else if (idx < deviceList.length) {
            const dId = deviceList[idx]?.id;
            if (dId) {
              await fetch('https://api.spotify.com/v1/me/player', {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_ids: [dId], play: true })
              });
            }
            isSubMenu = false;
          }
          updateGlassesUI(bridge, true);
        }
      });
    } catch (e) { console.error(e); }
  }
}

async function fetchDevices(token: string) {
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    deviceList = data.devices || [];
    return deviceList;
  } catch (e) { return []; }
}

async function syncSpotify(token: string) {
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) { logout(); return; }
    if (res.status === 200) {
      const data = await res.json();
      if (data?.item) {
        trackData = {
          name: data.item.name,
          artist: data.item.artists[0].name,
          progressMs: data.progress_ms,
          durationMs: data.item.duration_ms,
          isPlaying: data.is_playing
        };
        updateWebDisplay();
      }
    } else if (res.status === 204) {
      trackData.name = "No Active Session";
      trackData.artist = "Open Spotify";
      trackData.isPlaying = false;
      updateWebDisplay();
    }
  } catch (e) { console.error("Sync Error:", e); }
}

function updateWebDisplay() {
  const nameEl = document.getElementById('web-track-name');
  const artistEl = document.getElementById('web-track-artist');
  const barEl = document.getElementById('web-progress-bar');
  const pTimeEl = document.getElementById('web-p-time'); 
  const dTimeEl = document.getElementById('web-d-time'); 
  
  if (nameEl) nameEl.innerText = trackData.name;
  if (artistEl) artistEl.innerText = trackData.artist;
  if (pTimeEl) pTimeEl.innerText = formatTime(trackData.progressMs);
  if (dTimeEl) dTimeEl.innerText = formatTime(trackData.durationMs);
  if (barEl) {
    const pct = trackData.durationMs > 0 ? (trackData.progressMs / trackData.durationMs) * 100 : 0;
    barEl.style.width = `${pct}%`;
  }
}

window.addEventListener('load', startApp);