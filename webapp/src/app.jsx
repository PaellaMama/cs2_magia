import { useEffect, useState } from "react";
import "./app.css";
import PlayerCard from "./components/playercard";
import Radar from "./components/radar";
import { getLatency, Latency } from "./components/latency";
import MaskedIcon from "./components/maskedicon";

const CONNECTION_TIMEOUT = 5000;

/* change this to '1' if you want to use offline (your own pc only) */
const USE_LOCALHOST = 0;

/* you can get your public ip from https://ipinfo.io/ip */
const PUBLIC_IP = "your ip goes here".trim();
const PORT = 22006;

const EFFECTIVE_IP = USE_LOCALHOST ? "localhost" : PUBLIC_IP.match(/[a-zA-Z]/) ? window.location.hostname : PUBLIC_IP;

const KNOWN_MAPS = [
  "cs_agency",
  "cs_italy",
  "cs_office",
  "de_ancient",
  "de_anubis",
  "de_dust2",
  "de_grail",
  "de_inferno",
  "de_jura",
  "de_mills",
  "de_mirage",
  "de_nuke",
  "de_overpass",
  "de_thera",
  "de_train",
  "de_vertigo",
];

const KNOWN_MAP_PREFIXES = ["cs", "de", "ar", "gg", "aim", "awp", "fy", "dz"];

const getBaseMapName = (mapName) => {
  if (!mapName) {
    return "";
  }

  const normalized = mapName.toLowerCase();
  const segments = normalized.split("/");
  const lastSegment = segments[segments.length - 1] || "";
  const [baseName] = lastSegment.split(".");

  return baseName;
};

const sanitizeToken = (value, { removeDigits } = {}) => {
  if (!value) {
    return "";
  }

  const alphanumeric = value.replace(/[^a-z0-9]/g, "");
  return removeDigits ? alphanumeric.replace(/\d+/g, "") : alphanumeric;
};

const buildMapNameCandidates = (mapName) => {
  const baseName = getBaseMapName(mapName);
  if (!baseName) {
    return [];
  }

  const variants = new Set();
  const processedValues = new Set();

  const addVariants = (value) => {
    if (!value) {
      return;
    }

    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return;
    }

    if (processedValues.has(normalizedValue)) {
      return;
    }
    processedValues.add(normalizedValue);

    variants.add(normalizedValue);

    const sanitized = sanitizeToken(normalizedValue);
    if (sanitized) {
      variants.add(sanitized);
      const sanitizedNoDigits = sanitizeToken(normalizedValue, {
        removeDigits: true,
      });
      if (sanitizedNoDigits) {
        variants.add(sanitizedNoDigits);
      }
    }
    
    const segments = normalizedValue.split(/[^a-z0-9]+/i).filter(Boolean);
    segments.forEach((segment) => {
      if (segment !== normalizedValue) {
        addVariants(segment);
      }
    });

    if (normalizedValue.includes("_")) {
      const [firstSegment] = normalizedValue.split("_");
      if (firstSegment && firstSegment.length > 3) {
        variants.add(firstSegment);
        const firstSegmentSanitized = sanitizeToken(firstSegment);
        if (firstSegmentSanitized) {
          variants.add(firstSegmentSanitized);
          const firstSegmentNoDigits = sanitizeToken(firstSegment, { removeDigits: true });
          if (firstSegmentNoDigits) {
            variants.add(firstSegmentNoDigits);
          }
        }
      }
    }
  };

  addVariants(baseName);

  KNOWN_MAP_PREFIXES.forEach((prefix) => {
    const prefixWithUnderscore = `${prefix}_`;
    if (baseName.startsWith(prefixWithUnderscore)) {
      addVariants(baseName.slice(prefixWithUnderscore.length));
    }
  });

  return Array.from(variants).filter(Boolean);
};

const resolveMapName = (mapName) => {
  const baseName = getBaseMapName(mapName);

  if (!baseName || baseName === "invalid") {
    return "invalid";
  }

  if (KNOWN_MAPS.includes(baseName)) {
    return baseName;
  }

  const mapCandidates = buildMapNameCandidates(baseName);

  for (const canonicalMap of KNOWN_MAPS) {
    if (mapCandidates.includes(canonicalMap)) {
      return canonicalMap;
    }

    const canonicalCandidates = buildMapNameCandidates(canonicalMap);
    if (canonicalCandidates.some((candidate) => mapCandidates.includes(candidate))) {
      return canonicalMap;
    }
  }

  return "invalid";
};

const DEFAULT_SETTINGS = {
  dotSize: 1,
  bombSize: 0.5,
  showAllNames: false,
  showEnemyNames: true,
  showViewCones: false,
};

const loadSettings = () => {
  const savedSettings = localStorage.getItem("radarSettings");
  return savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
};

const App = () => {
  const [averageLatency, setAverageLatency] = useState(0);
  const [playerArray, setPlayerArray] = useState([]);
  const [mapData, setMapData] = useState();
  const [mapName, setMapName] = useState();
  const [rawMapName, setRawMapName] = useState();
  const [localTeam, setLocalTeam] = useState();
  const [bombData, setBombData] = useState();
  const [settings, setSettings] = useState(loadSettings());
  const [bannerOpened, setBannerOpened] = useState(true)

  // Save settings to local storage whenever they change
  useEffect(() => {
    localStorage.setItem("radarSettings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const fetchData = async () => {
      let webSocket = null;
      let webSocketURL = null;
      let connectionTimeout = null;

      if (PUBLIC_IP.startsWith("192.168")) {
        document.getElementsByClassName(
          "radar_message"
        )[0].textContent = `A public IP address is required! Currently detected IP (${PUBLIC_IP}) is a private/local IP`;
        return;
      }

      if (!webSocket) {
        try {
          if (USE_LOCALHOST) {
            webSocketURL = `ws://localhost:${PORT}/cs2_webradar`;
          } else {
            webSocketURL = `ws://${EFFECTIVE_IP}:${PORT}/cs2_webradar`;
          }

          if (!webSocketURL) return;
          webSocket = new WebSocket(webSocketURL);
        } catch (error) {
          document.getElementsByClassName(
            "radar_message"
          )[0].textContent = `${error}`;
        }
      }

      connectionTimeout = setTimeout(() => {
        webSocket.close();
      }, CONNECTION_TIMEOUT);

      webSocket.onopen = async () => {
        clearTimeout(connectionTimeout);
        console.info("connected to the web socket");
      };

      webSocket.onclose = async () => {
        clearTimeout(connectionTimeout);
        console.error("disconnected from the web socket");
      };

      webSocket.onerror = async (error) => {
        clearTimeout(connectionTimeout);
        document.getElementsByClassName(
          "radar_message"
        )[0].textContent = `WebSocket connection to '${webSocketURL}' failed. Please check the IP address and try again`;
        console.error(error);
      };

      webSocket.onmessage = async (event) => {
        setAverageLatency(getLatency());

        const parsedData = JSON.parse(await event.data.text());
        setPlayerArray(parsedData.m_players);
        setLocalTeam(parsedData.m_local_team);
        setBombData(parsedData.m_bomb);

        const map = parsedData.m_map;
        const rawMap = parsedData.m_map_raw ?? map;

        const resolvedMap = resolveMapName(map);

        setMapName(resolvedMap);
        setRawMapName(rawMap);

        if (resolvedMap !== "invalid") {
          try {
            const mapResponse = await fetch(`data/${resolvedMap}/data.json`);
            const mapJson = await mapResponse.json();
            setMapData({ ...mapJson, name: resolvedMap });
            document.body.style.backgroundImage = `url(./data/${resolvedMap}/background.png)`;
          } catch (error) {
            console.error("Failed to load map data", error);
            setMapData(undefined);
            document.body.style.backgroundImage = "";
          }
          
        } else {
          setMapData(undefined);
          document.body.style.backgroundImage = "";
        }
      };
    };

    fetchData();
  }, []);

  return (
    <div className="w-screen h-screen flex flex-col"
      style={{
        background: `radial-gradient(50% 50% at 50% 50%, rgba(20, 40, 55, 0.95) 0%, rgba(7, 20, 30, 0.95) 100%)`,
        backdropFilter: `blur(7.5px)`,
      }}
    >
      {bannerOpened && (
        <section className="w-full flex items-center justify-between p-2 bg-radar-primary">
          <span className="w-full text-center text-[#1E3A54]">
            <span className="font-medium">€3.49</span> -
            HURRACAN - Plug & play feature rich shareable CS2 Web Radar
            <a className="ml-2 inline banner-link text-[#1E3A54]" href="https://hurracan.com">Learn more</a>
          </span>
          <button onClick={() => setBannerOpened(false)} className="hover:bg-[#9BC5E4]">
            <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
              <path fill="#4E799F" d="M 7.21875 5.78125 L 5.78125 7.21875 L 14.5625 16 L 5.78125 24.78125 L 7.21875 26.21875 L 16 17.4375 L 24.78125 26.21875 L 26.21875 24.78125 L 17.4375 16 L 26.21875 7.21875 L 24.78125 5.78125 L 16 14.5625 Z" />
            </svg>
          </button>
        </section>
      )}
      <div className={`w-full h-full flex flex-col justify-center overflow-hidden relative`}>
        {bombData && bombData.m_blow_time > 0 && !bombData.m_is_defused && (
          <div className={`absolute left-1/2 top-2 flex-col items-center gap-1 z-50`}>
            <div className={`flex justify-center items-center gap-1`}>
              <MaskedIcon
                path={`./assets/icons/c4_sml.png`}
                height={32}
                color={
                  (bombData.m_is_defusing &&
                    bombData.m_blow_time - bombData.m_defuse_time > 0 &&
                    `bg-radar-green`) ||
                  (bombData.m_blow_time - bombData.m_defuse_time < 0 &&
                    `bg-radar-red`) ||
                  `bg-radar-secondary`
                }
              />
              <span>{`${bombData.m_blow_time.toFixed(1)}s ${(bombData.m_is_defusing &&
                `(${bombData.m_defuse_time.toFixed(1)}s)`) ||
                ""
                }`}</span>
            </div>
          </div>
        )}

        <div className={`flex items-center justify-evenly`}>
          <Latency
            value={averageLatency}
            settings={settings}
            setSettings={setSettings}
          />

          <ul id="terrorist" className="lg:flex hidden flex-col gap-7 m-0 p-0">
            {playerArray
              .filter((player) => player.m_team == 2)
              .map((player) => (
                <PlayerCard
                  right={false}
                  key={player.m_idx}
                  playerData={player}
                />
              ))}
          </ul>

          {(playerArray.length > 0 && mapData && (
            <Radar
              playerArray={playerArray}
              radarImage={`./data/${mapData.name}/radar.png`}
              mapData={mapData}
              localTeam={localTeam}
              averageLatency={averageLatency}
              bombData={bombData}
              settings={settings}
            />
          )) || (
              <div id="radar" className={`relative overflow-hidden origin-center`}>
                <h1 className="radar_message">
                  {(mapName === "invalid" &&
                    `Mapa desconocido${rawMapName ? `: ${rawMapName}` : ""}`) ||
                    "Connected! Waiting for data from usermode"}
                </h1>
              </div>
            )}

          <ul
            id="counterTerrorist"
            className="lg:flex hidden flex-col gap-7 m-0 p-0"
          >
            {playerArray
              .filter((player) => player.m_team == 3)
              .map((player) => (
                <PlayerCard
                  right={true}
                  key={player.m_idx}
                  playerData={player}
                  settings={settings}
                />
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default App;
