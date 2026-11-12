const OWNER = "leeuw008-nl";
const REPO = "TijdBeeld-data";
const BRANCH = "main";
const PATH = "photos.json";
const GITHUB_API = "https://api.github.com";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status = 200, origin = "*", extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
      ...extra
    }
  });
}

function validCatalog(data) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.photos)) return "Ongeldig catalogusformaat.";
  if (data.photos.length < 1 || data.photos.length > 100) return "De catalogus moet 1 tot 100 foto's bevatten.";
  const ids = new Set();
  for (const p of data.photos) {
    if (!p || typeof p.id !== "string" || !p.id.trim() || ids.has(p.id)) return "Elke foto moet een uniek ID hebben.";
    ids.add(p.id);
    if (typeof p.title !== "string" || p.title.length > 200) return "Ongeldige fototitel.";
    if (typeof p.imageUrl !== "string" || !p.imageUrl.startsWith("https://")) return "Elke foto moet een HTTPS-afbeeldingsadres hebben.";
    for (const key of ["objectLat", "objectLng", "cameraLat", "cameraLng"]) {
      if (typeof p[key] !== "number" || !Number.isFinite(p[key])) return "Ongeldige coördinaten.";
    }
    if (Math.abs(p.objectLat) > 90 || Math.abs(p.cameraLat) > 90 ||
        Math.abs(p.objectLng) > 180 || Math.abs(p.cameraLng) > 180) return "Coördinaten buiten bereik.";
    if (typeof p.imageWidthMeters !== "number" || p.imageWidthMeters < 1 || p.imageWidthMeters > 12) return "Fotobreedte moet tussen 1 en 12 meter liggen.";
  }
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/photos")) {
      const upstream = await fetch("https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/" + BRANCH + "/" + PATH, {
        headers: { "Cache-Control": "no-cache" }
      });
      if (!upstream.ok) return json({ error: "Catalogus tijdelijk niet beschikbaar." }, 502, origin);
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          ...corsHeaders(origin)
        }
      });
    }

    if (request.method === "POST" && url.pathname === "/photos") {
      if (!env.ADMIN_SECRET || !env.GITHUB_TOKEN) return json({ error: "Worker is nog niet volledig ingesteld." }, 503, origin);
      const auth = request.headers.get("Authorization") || "";
      const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!supplied || supplied.length !== env.ADMIN_SECRET.length) return json({ error: "Geen toegang." }, 401, origin);
      const a = new TextEncoder().encode(supplied);
      const b = new TextEncoder().encode(env.ADMIN_SECRET);
      const digestA = await crypto.subtle.digest("SHA-256", a);
      const digestB = await crypto.subtle.digest("SHA-256", b);
      const da = new Uint8Array(digestA), db = new Uint8Array(digestB);
      let diff = 0;
      for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
      if (diff !== 0) return json({ error: "Geen toegang." }, 401, origin);

      let data;
      try {
        const raw = await request.text();
        if (raw.length > 1000000) return json({ error: "Catalogus is te groot." }, 413, origin);
        data = JSON.parse(raw);
      } catch {
        return json({ error: "Ongeldige JSON." }, 400, origin);
      }
      const validationError = validCatalog(data);
      if (validationError) return json({ error: validationError }, 400, origin);

      const apiHeaders = {
        "Authorization": "Bearer " + env.GITHUB_TOKEN,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "TijdBeeld-Catalog-Worker"
      };
      const currentResponse = await fetch(GITHUB_API + "/repos/" + OWNER + "/" + REPO + "/contents/" + PATH + "?ref=" + BRANCH, {
        headers: apiHeaders
      });
      if (!currentResponse.ok) return json({ error: "Huidige catalogus kon niet worden opgehaald." }, 502, origin);
      const current = await currentResponse.json();
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2) + "\n")));
      const updateResponse = await fetch(GITHUB_API + "/repos/" + OWNER + "/" + REPO + "/contents/" + PATH, {
        method: "PUT",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Update public historical photo catalog",
          content: encoded,
          sha: current.sha,
          branch: BRANCH
        })
      });
      const result = await updateResponse.json();
      if (!updateResponse.ok) return json({ error: "Opslaan in GitHub is mislukt.", detail: result.message || "" }, 502, origin);
      return json({ success: true, commit: result.commit?.sha || null }, 200, origin);
    }

    return json({ error: "Niet gevonden." }, 404, origin);
  }
};
