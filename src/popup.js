const xtouchScreensServers = [];

const jsonData = {
  wifi: { ssid: "", pwd: "" },
  bambuCloud: {
    account: "",
    region: "",
    username: "",
    authToken: "",
  },
  time: { timezone: "" },
};

const $id = document.getElementById.bind(document);
let refreshDone = false;

// Function to validate form inputs
function validateForm() {
  const form = document.querySelector("form");
  let isValid = true;
  const validationMessages = {
    ssid: "SSID is required.",
    password: "Password is required.",
    ip: "IP address is required.",
  };
  form.querySelectorAll("input").forEach((input) => {
    const errorElement = $id(input.name + "-error");
    if (input.value.trim() === "") {
      errorElement.textContent = validationMessages[input.name];
      isValid = false;
    } else {
      errorElement.textContent = "";
    }
  });

  return isValid;
}

// Function to refresh the tab
async function refreshTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    return new Promise((resolve) => {
      chrome.tabs.reload(tab.id, {}, () => {
        setTimeout(() => {
          resolve();
        }, 2000);
      });
    });
  }
}

async function isExtensionBlocked() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  return new Promise((resolve) => {
    if (tab.url) {
      return chrome.cookies.getAll({}, async (cookies) => {
        console.log(cookies);

        if (cookies.length === 0) {
          $id("main-blocked").style.display = "block";
          $id("main-loading").style.display = "none";
          resolve(true);
        } else {
          resolve(false);
        }
      });
    }
    return false;
  });
}
// Function to fetch metadata from the current tab
async function fetchMetadata() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Get SSID and password from the input fields
  const ssidValue = $id("ssid").value.trim();
  const pwdValue = $id("password").value.trim();

  // Update jsonData with ssid and password
  jsonData.wifi.ssid = ssidValue;
  jsonData.wifi.pwd = pwdValue;

  jsonData["bambuCloud"]["region"] = tab.url.includes("bambulab.cn")
    ? "China"
    : "World";

  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      func: () => {
        const nextDataScript = document.getElementById("__NEXT_DATA__");
        if (nextDataScript && nextDataScript.type === "application/json") {
          const data = JSON.parse(nextDataScript.textContent);
          const userData = data?.props?.pageProps?.session?.user;
          if (userData) {
            return userData;
          } else {
            console.log("NOT USER DATA");
            console.log(nextDataScript.textContent);
            return { error: true };
          }
        } else {
          console.log("SCRIPT NOT FOUND");
          return { error: true };
        }
      },
    },
    (results) => {
      if (chrome.runtime.lastError) {
        $id("region-selector").style.display = "none";
        console.log("No user data found");
        console.log(chrome.runtime.lastError);
        toggleContainers(false);
        return;
      }

      const result = results[0]?.result;

      if (result && result.error) {
        console.log("No user data found");
        $id("region-selector").style.display = "none";
        toggleContainers(false);
        return;
      }

      if (!result || !result.account || !result.uidStr) {
        console.log("No user data found");
        $id("region-selector").style.display = "none";
        toggleContainers(false);
        return;
      }
      console.log("User data found");
      jsonData["bambuCloud"]["account"] = result.account;
      jsonData["bambuCloud"]["username"] = result.uidStr;

      toggleContainers(true);
      fetchCookies();
    }
  );
}

// Function to fetch cookies
async function fetchCookies() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  jsonData["bambuCloud"]["region"] = tab.url.includes("bambulab.cn")
    ? "China"
    : "World";

  if (tab.url) {
    chrome.cookies.getAll({}, async (cookies) => {
      console.log("cookies", cookies);
      const filteredCookies = cookies.filter(
        (e) => e.domain.includes("bambulab.c") && e.name === "token"
      );
      console.log("filteredCookies", filteredCookies);
      if (filteredCookies.length === 0) {
        toggleContainers(false);
      } else {
        console.log("Token found");
        const authToken = filteredCookies[0].value;
        jsonData["bambuCloud"]["authToken"] = authToken;
        $id("downloadJson").style.display = "inline-block";
        $id("downloadJson").removeAttribute("hidden");
        findDevices();
      }
    });
  }
}

// Function to toggle visibility of main containers
function toggleContainers(showMain) {
  if (showMain) {
    $id("main-container").style.display = "block";
    $id("main-login-container").style.display = "none";
  } else {
    $id("main-container").style.display = "none";
    $id("main-login-container").style.display = "block";
  }
}

// Function to handle downloading JSON data
async function downloadJsonData() {
  if (!validateForm()) {
    return;
  }

  jsonData.wifi.ssid = $id("ssid").value.trim();
  jsonData.wifi.pwd = $id("password").value.trim();

  localStorage.setItem(
    "jsonData",
    JSON.stringify({ ...jsonData, ip: $id("ip").value.trim() })
  );

  downloadProvisioningJson();
}

async function provisionDevice() {
  if (!validateForm()) {
    return;
  }
  const ipValue = $id("ip").value.trim();
  if (ipValue !== "0.0.0.0") {
    try {
      const response = await fetch(`http://${ipValue}/xprovision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jsonData),
      });

      if (!response.ok) {
        $id("provision-error").style.display = "block";
      } else {
        $id("provision-error").style.display = "none";
      }
    } catch (error) {
      $id("provision-error").style.display = "block";
    }
  }
}

// Function to download provisioning JSON
function downloadProvisioningJson() {
  const a = document.createElement("a");
  const file = new Blob([JSON.stringify(jsonData, null, 2)], {
    type: "application/json",
  });
  a.href = URL.createObjectURL(file);
  a.download = "config.json";
  a.click();
  a.remove();
}

// Load data from localStorage if available
function loadStoredData() {
  const storedJsonData = localStorage.getItem("jsonData");

  if (storedJsonData) {
    const localJsonData = JSON.parse(storedJsonData);
    console.log(localJsonData);
    $id("ip").value = localJsonData.ip;
    $id("ssid").value = localJsonData.wifi?.ssid || "";
    $id("password").value = localJsonData.wifi?.pwd || "";
  }
}

// Initialize the script
function initialize() {
  $id("main-loading").style.display = "none";
  loadStoredData();
  fetchMetadata();
}

function findDevices() {
  getLocalIPAddress((ip) => {
    pingSubnet(ip).then((openPorts) => {
      console.log("Devices with port 8192 open:", openPorts);
      xtouchScreensServers.push(...openPorts);
      if (xtouchScreensServers.length === 0) {
        $id("xtouch-send").setAttribute("hidden", true);
        $id("provisionDevice").removeAttribute("hidden");
        return;
      }
      $id("xtouch-send").innerHTML = "";

      xtouchScreensServers.forEach(async (server) => {
        console.log(server);
        const url = `http://${server}/xping`;
        try {
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          });
          if (response.ok) {
            const data = await response.json();
            const localName = data.localName;
            console.log(`Local name for server ${server}: ${localName}`);
            const serverElement = document.createElement("div");
            serverElement.setHTMLUnsafe = true;
            serverElement.innerHTML = `<button type="button" class="xtouch-send-button btn btn-custom btn-block font-weight-bold" id="fetchCookies" title="${server}">Provision => ${localName}</button>`;
            $id("xtouch-send").appendChild(serverElement);
          } else {
            console.error(`Failed to fetch from ${server}`);
          }
        } catch (error) {
          console.error(`Error fetching from ${server}:`, error);
        }
        document.querySelectorAll(".xtouch-send-button").forEach((button) => {
          button.addEventListener("click", () => {
            provision(button);
          });
        });
      });
    });
  });
}
function redirectTab(url) {
  chrome.tabs.query({ active: true, currentWindow: true }).then((tab) => {
    chrome.tabs.update(tab.id, { url });
  });
}

function checkUrl() {
  return chrome.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => {
      console.log(tabs[0].url);
      if (
        !tabs[0].url.includes("bambulab.c") ||
        tabs[0].url.includes("store.bambulab.c")
      ) {
        $id("main-login-container").style.display = "block";
        $id("main-loading").style.display = "none";
        return false;
      }
      return true;
    });
}

const provision = (button) => {
  const server = button.getAttribute("title");
  const url = `http://${server}/xprovision`;
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(jsonData),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log("Provision response:", data);
      button.innerHTML = "Provisioned";
      button.disabled = true;
    })
    .catch((error) => {
      console.error("Provision error:", error);
    });
};

function main() {
  checkUrl().then((correctURL) => {
    console.log("correctURL", correctURL);
    if (correctURL) {
      isExtensionBlocked().then((isBlocked) => {
        console.log("isBlocked", isBlocked);
        if (isBlocked) {
          $id("main-login-container").style.display = "none";
          return;
        } else {
          refreshTab().then(() => {
            initialize();
          });
        }
      });
    }
  });
}

function getLocalIPAddress(callback) {
  const pc = new RTCPeerConnection({
    iceServers: [],
  });

  pc.onicecandidate = (event) => {
    if (!event || !event.candidate) {
      pc.close();
      return;
    }

    const candidate = event.candidate.candidate;
    const ipMatch = candidate.match(/(\d{1,3}\.){3}\d{1,3}/);
    if (ipMatch) {
      const localIP = ipMatch[0];
      callback(localIP);
      pc.close();
    }
  };

  pc.createDataChannel("dummy");
  pc.createOffer()
    .then((offer) => pc.setLocalDescription(offer))
    .catch((error) => console.error("Error creating offer:", error));
}

async function pingSubnet(ipAddress) {
  const subnetBase = ipAddress.split(".").slice(0, 3).join(".");
  const chunkSize = 16; // Define chunk size
  const openPorts = [];
  let index = 0;
  // Helper function to ping a single IP
  const pingIP = async (targetIP) => {
    const url = `http://${targetIP}/xping`;
    try {
      const response = await fetch(url, {
        mode: "no-cors",
        signal: AbortSignal.timeout(2000),
        method: "GET",
      });

      if (response && response.ok) {
        const isGatewayDevice = await isGateway(targetIP);
        if (!isGatewayDevice) {
          console.log(`Found device at ${targetIP}`);
          return targetIP;
        }
      }
    } catch (error) {
      // Ignore errors
    }
    $id(
      "xtouch-send"
    ).innerHTML = `<button style="padding:32px;" class="btn btn-custom btn-block font-weight-bold">| Searching | ${Math.ceil(
      (index * 100) / 255
    )}% |</button>`;
    index++;
    return null;
  };

  // Process a range of IPs in parallel
  const pingRange = async (start, end) => {
    const tasks = [];
    for (let i = start; i <= end; i++) {
      const targetIP = `${subnetBase}.${i}`;
      tasks.push(pingIP(targetIP));
    }
    const results = await Promise.all(tasks);
    return results.filter((ip) => ip !== null); // Filter out null results
  };

  // Create IP ranges and process them in parallel
  const ipChunks = [];
  for (let i = 1; i <= 255; i += chunkSize) {
    ipChunks.push({ start: i, end: Math.min(i + chunkSize - 1, 255) });
  }

  const chunkPromises = ipChunks.map(({ start, end }) => pingRange(start, end));
  const results = await Promise.all(chunkPromises);

  // Flatten results
  results.forEach((chunkResult) => openPorts.push(...chunkResult));

  return openPorts;
}

async function pingSubnet1(ipAddress) {
  const subnetBase = ipAddress.split(".").slice(0, 3).join(".");
  const openPorts = [];

  for (let i = 1; i < 255; i++) {
    const targetIP = `${subnetBase}.${i}`;
    const url = `http://${targetIP}/xping`;

    try {
      console.log(url);
      const response = await fetch(url, {
        mode: "no-cors",
        signal: AbortSignal.timeout(100),
        priority: "high",
        keepalive: false,
        method: "GET",
      });

      if (response.status == 200) {
        isGateway(targetIP).then((isGateway) => {
          if (!isGateway) {
            console.log(`Found device at ${targetIP}`);
            openPorts.push(targetIP);
          }
        });
      }
    } catch (error) {}

    $id(
      "xtouch-send"
    ).innerHTML = `<button style="padding:32px;">| Searching | ${Math.ceil(
      (i * 100) / 255
    )}% |</button>`;
  }

  return openPorts;
}

async function isGateway(ip) {
  const peerConnection = new RTCPeerConnection({ iceServers: [] });
  peerConnection.createDataChannel("");
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  return new Promise((resolve) => {
    peerConnection.onicecandidate = (event) => {
      if (!event || !event.candidate) {
        peerConnection.close();
        resolve(false);
        return;
      }

      const candidate = event.candidate.candidate;
      if (candidate.includes(` ${ip} `)) {
        console.log(`${ip} is the gateway (router).`);
        resolve(true);
      }
    };
  });
}

document.addEventListener("DOMContentLoaded", () => {
  jsonData["time"]["timezone"] =
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log(jsonData["time"]["timezone"]);
  $id("downloadJson").addEventListener("click", downloadJsonData);
  $id("provisionDevice-button").addEventListener("click", provisionDevice);

  $id("region-china").addEventListener("click", () => {
    const newUrl = "https://bambulab.cn";
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { url: newUrl }, () => {
          main();
        });
      }
    });
  });
  $id("region-world").addEventListener("click", () => {
    const newUrl = "https://bambulab.com";
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { url: newUrl }, () => {
          main();
        });
      }
    });
  });
  main();
});
