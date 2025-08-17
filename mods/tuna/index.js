// Tuna SignalR Client for Electron
console.log("[Tuna] Loading Tuna SignalR Client");

// Configuration
const config = {
  devHubUrl: "http://localhost:9255/hubs/tuna",
  prodHubUrl: "http://localhost:9155/hubs/tuna",
  refreshRateMs: 1000,
  initialReconnectDelay: 1000,
  maxReconnectDelay: 30000,
  reconnectBackoffFactor: 1.5,
};

// Current state
const playerState = {
  lastSentState: null,
  prodConnection: null,
  devConnection: null,
  prodIsConnected: false,
  devIsConnected: false,
  isInitialized: false,
  prodReconnectAttempts: 0,
  devReconnectAttempts: 0,
  prodReconnectTimer: null,
  devReconnectTimer: null,
};

// Initialize SignalR connections
async function initSignalR() {
  if (playerState.isInitialized) {
    console.log("[Tuna] SignalR already initialized");
    return;
  }

  console.log("[Tuna] Initializing SignalR connections...");

  // Check if SignalR is available
  if (typeof signalR === "undefined") {
    console.error("[Tuna] SignalR not loaded! Make sure to include signalr.min.js");
    return;
  }

  // Create production connection
  playerState.prodConnection = new signalR.HubConnectionBuilder()
    .withUrl(config.prodHubUrl, {
      skipNegotiation: true,
      transport: signalR.HttpTransportType.WebSockets,
    })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  // Create development connection
  playerState.devConnection = new signalR.HubConnectionBuilder()
    .withUrl(config.devHubUrl, {
      skipNegotiation: true,
      transport: signalR.HttpTransportType.WebSockets,
    })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Debug)
    .build();

  // Setup production connection events
  setupConnectionEvents(playerState.prodConnection, "prod");
  // Setup development connection events
  setupConnectionEvents(playerState.devConnection, "dev");

  // Start connections
  console.log("[Tuna] Starting connections...");
  try {
    await startConnection(playerState.devConnection, "dev");
  } catch (err) {
    console.error("[Tuna] Dev connection failed:", err);
  }
  try {
    await startConnection(playerState.prodConnection, "prod");
  } catch (err) {
    console.error("[Tuna] Prod connection failed:", err);
  }

  playerState.isInitialized = true;
  console.log("[Tuna] SignalR connections initialized");
}

function setupConnectionEvents(connection, type) {
  connection.onclose(async (error) => {
    if (type === "prod") {
      playerState.prodIsConnected = false;
    } else {
      playerState.devIsConnected = false;
    }
    console.log(
      `[Tuna] ${
        type === "prod" ? "Production" : "Development"
      }: Connection closed`,
      error ? `Error: ${error.message}` : ""
    );

    // Schedule reconnection
    scheduleReconnect(connection, type);
  });

  connection.onreconnecting((error) => {
    if (type === "prod") {
      playerState.prodIsConnected = false;
    } else {
      playerState.devIsConnected = false;
    }
    console.log(
      `[Tuna] ${
        type === "prod" ? "Production" : "Development"
      }: Connection lost, reconnecting...`,
      error.message
    );
  });

  connection.onreconnected((connectionId) => {
    if (type === "prod") {
      playerState.prodIsConnected = true;
      playerState.prodReconnectAttempts = 0;
    } else {
      playerState.devIsConnected = true;
      playerState.devReconnectAttempts = 0;
    }
    console.log(
      `[Tuna] ${
        type === "prod" ? "Production" : "Development"
      }: Connection reestablished. Connection ID: ${connectionId}`
    );
  });
}

function scheduleReconnect(connection, type) {
  const attempts =
    type === "prod"
      ? ++playerState.prodReconnectAttempts
      : ++playerState.devReconnectAttempts;

  // Calculate delay with exponential backoff
  const delay = Math.min(
    config.initialReconnectDelay *
      Math.pow(config.reconnectBackoffFactor, attempts - 1),
    config.maxReconnectDelay
  );

  console.log(
    `[Tuna] ${
      type === "prod" ? "Production" : "Development"
    }: Scheduling reconnect attempt ${attempts} in ${delay}ms`
  );

  const timer = setTimeout(async () => {
    try {
      await startConnection(connection, type);
    } catch (error) {
      console.error(
        `[Tuna] ${
          type === "prod" ? "Production" : "Development"
        }: Reconnect failed:`,
        error
      );
      scheduleReconnect(connection, type); // Continue trying
    }
  }, delay);

  if (type === "prod") {
    clearTimeout(playerState.prodReconnectTimer);
    playerState.prodReconnectTimer = timer;
  } else {
    clearTimeout(playerState.devReconnectTimer);
    playerState.devReconnectTimer = timer;
  }
}

async function startConnection(connection, type) {
  try {
    await connection.start();
    if (type === "prod") {
      playerState.prodIsConnected = true;
      playerState.prodReconnectAttempts = 0;
    } else {
      playerState.devIsConnected = true;
      playerState.devReconnectAttempts = 0;
    }
    console.log(
      `[Tuna] ${
        type === "prod" ? "Production" : "Development"
      }: Connection started successfully`
    );
    return true;
  } catch (err) {
    console.error(
      `[Tuna] ${
        type === "prod" ? "Production" : "Development"
      }: Connection start failed:`,
      err
    );
    if (type === "prod") {
      playerState.prodIsConnected = false;
    } else {
      playerState.devIsConnected = false;
    }
    throw err;
  }
}

// Helper function to convert time string to milliseconds
function timeToMs(timeStr) {
  if (!timeStr) return 0;
  const [minutes, seconds] = timeStr.split(":").map(Number);
  return (minutes * 60 + seconds) * 1000;
}

// Collect player data using the same selectors as Discord RPC
function collectPlayerData() {
  try {
    const player = document.querySelector('section[data-test-id="PLAYERBAR_DESKTOP"]') || 
                   document.querySelector('section[class*="PlayerBarMobile_root__"]');
    
    if (!player) {
      console.debug("[Tuna] Player element not found");
      return;
    }

    const titleElement = player.querySelector('a[data-test-id="TRACK_TITLE"]') || 
                         player.querySelector('span[class*="Meta_title__"]');
    const artistsElement = player.querySelector('span[class*="Meta_albumTitle__"]') || 
                          player.querySelectorAll('a[data-test-id="SEPARATED_ARTIST_TITLE"]');
    const imageElement = player.querySelector('img[data-test-id="ENTITY_COVER"]') || 
                        player.querySelector('img[data-test-id="ENTITY_COVER_IMAGE"]');
    const timerStart = player.querySelector('span[data-test-id="TIMECODE_TIME_START"]')?.innerText?.trim();
    const timerEnd = player.querySelector('span[data-test-id="TIMECODE_TIME_END"]')?.innerText?.trim();
    const idElement = player.querySelector('a[data-test-id="TRACK_TITLE"]') || 
                      player.querySelector('a[class*=Meta_link__]');
    const isPlaying = !!player.querySelector('button[data-test-id="PAUSE_BUTTON"]');

    const trackTitle = titleElement?.innerText?.trim();
    const trackArtists = (artistsElement instanceof NodeList ? [...artistsElement] : [artistsElement])
      .map(x => x.innerText.trim())
      .filter(x => x);
    const trackImage = imageElement?.src;
    const trackId = idElement?.href?.trim()?.split('=')?.at(-1);
    const albumUrl = trackId ? `https://music.yandex.ru/album/${trackId}` : "";

    if (!trackTitle) {
      console.debug("[Tuna] No track title found");
      return;
    }

    // Calculate progress and duration
    const progress = timerStart ? timeToMs(timerStart) : 0;
    const duration = timerStart && timerEnd ? timeToMs(timerEnd) : 0;

    // Prepare data in the format expected by SignalR hub
    const data = {
      cover: trackImage || "",
      title: trackTitle,
      artists: trackArtists,
      status: isPlaying ? "playing" : "stopped",
      progress: progress,
      duration: duration,
      album_url: albumUrl,
    };

    sendPlayerData(data);
  } catch (error) {
    console.error("[Tuna] Data collection error:", error);
  }
}

// Send data to Hub
async function sendPlayerData(data) {
  try {
    // Skip if state hasn't changed
    if (
      playerState.lastSentState &&
      JSON.stringify(playerState.lastSentState) === JSON.stringify(data)
    ) {
      return;
    }

    const payload = {
      data: data,
      hostname: "YandexMusicBetaMod",
      timestamp: new Date().toISOString(),
    };

    // Send to production hub if connected
    if (playerState.prodIsConnected) {
      try {
        await playerState.prodConnection.invoke("SendPlayerData", payload);
        console.debug("[Tuna] Data sent to production hub:", data);
      } catch (err) {
        console.error("[Tuna] Error sending to production hub:", err);
        playerState.prodIsConnected = false;
      }
    } else {
      console.log("[Tuna] Not connected to production hub, skipping send");
    }

    // Send to development hub if connected
    if (playerState.devIsConnected) {
      try {
        await playerState.devConnection.invoke("SendPlayerData", payload);
        console.debug("[Tuna] Data sent to development hub:", data);
      } catch (err) {
        console.error("[Tuna] Error sending to development hub:", err);
        playerState.devIsConnected = false;
      }
    } else {
      console.log("[Tuna] Not connected to development hub, skipping send");
    }

    playerState.lastSentState = data;
  } catch (err) {
    console.error("[Tuna] Error in sendPlayerData:", err);
  }
}

// Main initialization
async function initialize() {
  console.log("[Tuna] Initializing Tuna SignalR client...");
  
  await initSignalR();

  // Start data collection
  setInterval(collectPlayerData, config.refreshRateMs);
  console.log("[Tuna] Tuna SignalR client initialized");
}

// Start when DOM is ready
if (document.readyState === "complete") {
  initialize();
} else {
  window.addEventListener("load", initialize);
}
