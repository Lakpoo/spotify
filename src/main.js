const clientId = ""; // Replace with your client ID
const params = new URLSearchParams(window.location.search);
const code = params.get("code");

const localToken = localStorage.getItem("token");
const expireIn = localStorage.getItem("expire_in");

if (localToken && expireIn && parseInt(expireIn) > Date.now()) {
  try {
    const profile = await fetchProfile(localToken);
    const playlists = await fetchUserPlaylist(localToken);
    populateUI(profile);
    populatePlaylists(playlists);
  } catch (error) {
    console.error("Token expired or invalid:", error);
    redirectToAuthCodeFlow(clientId);
  }
} else if (!code) {
  redirectToAuthCodeFlow(clientId);
} else {
  const accessToken = await getAccessToken(clientId, code);
  const profile = await fetchProfile(accessToken);
  const playlists = await fetchUserPlaylist(accessToken);
  populateUI(profile);
  populatePlaylists(playlists);
  setupSearch(accessToken);
}

export async function redirectToAuthCodeFlow(clientId) {
  const verifier = generateCodeVerifier(128);
  const challenge = await generateCodeChallenge(verifier);

  localStorage.setItem("verifier", verifier);

  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("response_type", "code");
  params.append("redirect_uri", "http://localhost:5173/callback");
  params.append("scope", "user-read-private user-read-email");
  params.append("code_challenge_method", "S256");
  params.append("code_challenge", challenge);

  document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function generateCodeVerifier(length) {
  let text = "";
  let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function getAccessToken(clientId, code) {
  const verifier = localStorage.getItem("verifier");

  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", "http://localhost:5173/callback");
  params.append("code_verifier", verifier);

  const result = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  const { access_token, expires_in } = await result.json();

  localStorage.setItem("token", access_token);
  localStorage.setItem("expire_in", (Date.now() + expires_in * 1000).toString());
  return access_token;
}

async function fetchProfile(token) {
  const result = await fetch("https://api.spotify.com/v1/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  return await result.json();
}

async function fetchUserPlaylist(token) {
  const result = await fetch("https://api.spotify.com/v1/me/playlists", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  return await result.json();
}

async function fetchPlaylist(token, userId) {
  const result = await fetch(`https://api.spotify.com/v1/users/"${userId}/playlists`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  return await result.json();
}

function populateUI(profile) {
  document.getElementById("displayName").innerText = profile.display_name;
  if (profile.images[0]) {
    const profileImage = new Image(200, 200);
    profileImage.src = profile.images[0].url;
    document.getElementById("avatar").appendChild(profileImage);
    document.getElementById("imgUrl").innerText = profile.images[0].url;
  }
  document.getElementById("id").innerText = profile.id;
  document.getElementById("email").innerText = profile.email;
  document.getElementById("uri").innerText = profile.uri;
  document.getElementById("uri").setAttribute("href", profile.external_urls.spotify);
  document.getElementById("url").innerText = profile.href;
  document.getElementById("url").setAttribute("href", profile.href);
}

function populatePlaylists(playlists) {
  const playlistContainer = document.getElementById("playlistContainer");

  const totalPlaylistsHeading = document.createElement("h3");
  totalPlaylistsHeading.innerText = `Total Playlists: ${playlists.total}`;
  playlistContainer.appendChild(totalPlaylistsHeading);

  playlists.items.forEach((playlist) => {
    const playlistItem = document.createElement("li");
    playlistItem.innerHTML = `
      <div class="playlist-details">
        <strong>${playlist.name}</strong>
        <p>Description: ${playlist.description || "No description"}</p>
        <p>Tracks: ${playlist.tracks.total}</p>
        ${playlist.images.length > 0 ? `<img src="${playlist.images[0].url}" alt="${playlist.name} cover" width="100" height="100">` : "No playlist image"}
        <p>
          <a href="${playlist.external_urls.spotify}" target="_blank">Open in Spotify</a>
        </p>
      </div>
    `;
    playlistContainer.appendChild(playlistItem);
  });
}

function populateSearchResults(results, container) {
  container.innerHTML = "";
  if (!results || results.length === 0) {
    container.innerHTML = "<p>No results found.</p>";
    return;
  }

  results.forEach((track) => {
    const trackElement = document.createElement("div");
    trackElement.classList.add("track");
    trackElement.innerHTML = `
      <p><strong>${track.name}</strong> by ${track.artists.map((artist) => artist.name).join(", ")}</p>
      <iframe 
        src="https://open.spotify.com/embed/track/${track.id}" 
        width="300" 
        height="80" 
        frameborder="0" 
        allowtransparency="true" 
        allow="encrypted-media">
      </iframe>
    `;
    container.appendChild(trackElement);
  });
}

function setupSearch(token) {
  const searchInput = document.getElementById("searchInput");
  const searchButton = document.getElementById("searchButton");
  const resultsContainer = document.getElementById("results");

  searchButton.addEventListener("click", async () => {
    const query = searchInput.value.trim();
    if (!query) {
      alert("Recherche ...");
      return;
    }

    const results = await searchSpotifyTracks(token, query);
    populateSearchResults(results, resultsContainer);
  });
}

async function searchSpotifyTracks(token, query) {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    const data = await response.json();
    console.log(data);
    return data.tracks.items;
  } catch (error) {
    console.error("Search failed:", error);
    alert("Failed to fetch search results.");
    return [];
  }
}
