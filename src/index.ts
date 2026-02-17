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

function getMenuItems() {
  if (isSubMenu) {
    const names = deviceList.length > 0 
      ? deviceList.map(d => (d.name || "DEVICE").toUpperCase().substring(0, 15)) 
      : ['NO DEVICES'];
    names.push('BACK');
    return names;
  }
  return ['PLAY', 'PAUSE', 'NEXT', 'PREV', 'DEVICES'];
}

// ================= BRIDGE LOGIC =================

async function updateGlassesUI(bridge: any, forcePageRefresh = false) {
  const token = localStorage.getItem('spotify_token');
  if (!token) return;

  const timeStr = `${formatTime(trackData.progressMs)} / ${formatTime(trackData.durationMs)}`;
  const displayContent = `${trackData.name}\n${trackData.artist}\n${timeStr}`;

  try {
    const menuNames = getMenuItems();

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

    if (isFirstRender) {
      console.log("[Debug] Attempting Startup...");
      const container = CreateStartUpPageContainer.fromJson({
        containerTotalNum: 2, textObject: [textObj], listObject: [listObj]
      });
      const res = await bridge.createStartUpPageContainer(container);
      console.log("[Debug] Startup Result:", res);
      if (res === 0) isFirstRender = false;
    } else if (forcePageRefresh) {
      console.log("[Debug] Attempting Rebuild...");
      const container = RebuildPageContainer.fromJson({
        containerTotalNum: 2, textObject: [textObj], listObject: [listObj]
      });
      const res = await bridge.rebuildPageContainer(container);
      console.log("[Debug] Rebuild Result:", res);
    } else {
      // Update track text only (if not swapping menus)
      await bridge.textContainerUpgrade({
        containerID: 1, containerName: 'text_box', content: displayContent
      });
    }
  } catch (e) { console.error("[Debug] UI Error:", e); }
}

async function startApp() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  let token = localStorage.getItem('spotify_token');

  if (code && !token) {
    token = await exchangeCode(code);
    if (token) window.history.replaceState({}, '', REDIRECT_URI);
  }

  // Simple Web UI
  document.body.style.cssText = "background:#121212; color:white; font-family:sans-serif; text-align:center; padding:50px;";
  if (!token) {
    document.body.innerHTML = `<h1>G2 Spotify</h1><button id="lbtn" style="padding:20px; background:#1DB954; color:white; border-radius:30px; border:none; font-weight:bold;">CONNECT SPOTIFY</button>`;
    document.getElementById('lbtn')?.addEventListener('click', redirectToSpotify);
    return;
  }

  document.body.innerHTML = `<h1>G2 ACTIVE</h1><p id="info">Syncing with glasses...</p><button id="obtn" style="margin-top:20px; opacity:0.5;">Logout</button>`;
  document.getElementById('obtn')?.addEventListener('click', logout);

  try {
    const bridge = await waitForEvenAppBridge();
    console.log("[Debug] Bridge Connected");

    // Sync Spotify Data
    setInterval(() => syncSpotify(token!), 5000);
    // Refresh UI on glasses
    setInterval(() => updateGlassesUI(bridge), 2000);

    bridge.onEvenHubEvent(async (e: any) => {
      // Check both locations for index data
      const source = e.listEvent || (e.jsonData && typeof e.jsonData === 'object' ? e.jsonData : null);
      if (!source) return;

      let idx = source.currentSelectItemIndex;
      
      // FIX FOR IPHONE (Index 0): If we have a list event but idx is null/undefined, it's 0.
      if (idx === undefined || idx === null) {
        console.log("[Debug] Index 0 assumed (missing field)");
        idx = 0;
      }

      console.log(`[Debug] Interaction at Index: ${idx}, isSubMenu: ${isSubMenu}`);

      if (!isSubMenu) {
        const action = ['play', 'pause', 'next', 'previous', 'devices'][idx];
        if (action === 'devices') {
          isSubMenu = true;
          await fetchDevices(token!);
          updateGlassesUI(bridge, true);
        } else if (action) {
          fetch(`https://api.spotify.com/v1/me/player/${action}`, {
            method: (action === 'play' || action === 'pause') ? 'PUT' : 'POST',
            headers: { Authorization: `Bearer ${token}` }
          });
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
  } catch (e) { console.error("[Debug] Init Failed:", e); }
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
        const el = document.getElementById('info');
        if (el) el.innerText = `${trackData.name} - ${trackData.artist}`;
      }
    }
  } catch (e) {}
}

window.addEventListener('load', startApp);