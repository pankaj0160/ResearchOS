"""
dashboard_agent.py — AI Dashboard tools and agent for ResearchOS.

Tools:
  get_weather(city)         → Open-Meteo API (free, no key required)
  get_travel_safety(dest)   → LLM-based safety briefing
  get_headlines(topic)      → Tavily news search (top 5 headlines)

Agent:
  run_dashboard_agent(query) → uses all 3 tools, returns plain-text answer
"""

from __future__ import annotations

import json
import requests

from langchain_core.tools import tool
from agents import get_chain_llm, get_tool_llm, _run_tool_loop

# ── Weather code → human-readable description ────────────────────────────────

_WMO_CODES: dict[int, str] = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Icy fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    80: "Slight showers", 81: "Moderate showers", 82: "Violent showers",
    95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Heavy thunderstorm",
}

_WMO_EMOJI: dict[int, str] = {
    0: "☀️", 1: "🌤", 2: "⛅", 3: "☁️",
    45: "🌫", 48: "🌫",
    51: "🌦", 53: "🌦", 55: "🌧",
    61: "🌧", 63: "🌧", 65: "🌧",
    71: "🌨", 73: "❄️", 75: "❄️",
    80: "🌦", 81: "🌧", 82: "⛈",
    95: "⛈", 96: "⛈", 99: "⛈",
}


def _wmo_label(code: int | None) -> str:
    if code is None:
        return "Unknown"
    return _WMO_CODES.get(int(code), f"Code {code}")


def _wmo_emoji(code: int | None) -> str:
    if code is None:
        return "🌡"
    return _WMO_EMOJI.get(int(code), "🌡")


# ── Weather Tool ──────────────────────────────────────────────────────────────

@tool
def get_weather(city: str) -> str:
    """
    Get current weather conditions and a 7-day forecast for a city.
    Uses Open-Meteo (free, no API key needed).
    Returns a JSON string with temperature, wind, precipitation and daily forecast.
    """
    city = city.strip()

    # 1. Geocode
    try:
        geo = requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": city, "count": 1, "language": "en", "format": "json"},
            timeout=8,
        ).json()
    except Exception as exc:
        return json.dumps({"error": f"Geocoding failed: {exc}"})

    results = geo.get("results")
    if not results:
        return json.dumps({"error": f"City '{city}' not found. Try a different spelling."})

    loc   = results[0]
    lat   = loc["latitude"]
    lon   = loc["longitude"]
    name  = loc.get("name", city)
    country = loc.get("country", "")
    tz    = loc.get("timezone", "auto")

    # 2. Fetch weather
    try:
        resp = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude":  lat,
                "longitude": lon,
                "current": [
                    "temperature_2m",
                    "apparent_temperature",
                    "weathercode",
                    "windspeed_10m",
                    "precipitation",
                    "relative_humidity_2m",
                ],
                "daily": [
                    "temperature_2m_max",
                    "temperature_2m_min",
                    "precipitation_sum",
                    "weathercode",
                    "windspeed_10m_max",
                ],
                "timezone":     tz,
                "forecast_days": 7,
            },
            timeout=8,
        ).json()
    except Exception as exc:
        return json.dumps({"error": f"Weather fetch failed: {exc}"})

    cur   = resp.get("current", {})
    daily = resp.get("daily", {})

    # Build 7-day forecast list
    forecast = []
    dates      = daily.get("time", [])
    max_temps  = daily.get("temperature_2m_max", [])
    min_temps  = daily.get("temperature_2m_min", [])
    precip     = daily.get("precipitation_sum", [])
    wcodes     = daily.get("weathercode", [])
    wind_max   = daily.get("windspeed_10m_max", [])

    for i in range(len(dates)):
        wc = wcodes[i] if i < len(wcodes) else None
        forecast.append({
            "date":         dates[i] if i < len(dates) else "",
            "max_c":        max_temps[i] if i < len(max_temps) else None,
            "min_c":        min_temps[i] if i < len(min_temps) else None,
            "precip_mm":    precip[i]    if i < len(precip)    else 0,
            "wind_max_kmh": wind_max[i]  if i < len(wind_max)  else None,
            "condition":    _wmo_label(wc),
            "emoji":        _wmo_emoji(wc),
            "code":         wc,
        })

    wc_cur = cur.get("weathercode")

    return json.dumps({
        "city":            name,
        "country":         country,
        "lat":             lat,
        "lon":             lon,
        "temp_c":          cur.get("temperature_2m"),
        "feels_like_c":    cur.get("apparent_temperature"),
        "humidity_pct":    cur.get("relative_humidity_2m"),
        "wind_kmh":        cur.get("windspeed_10m"),
        "precip_mm":       cur.get("precipitation"),
        "condition":       _wmo_label(wc_cur),
        "emoji":           _wmo_emoji(wc_cur),
        "code":            wc_cur,
        "forecast":        forecast,
    })


# ── Travel Safety Tool ────────────────────────────────────────────────────────

@tool
def get_travel_safety(destination: str) -> str:
    """
    Provide a concise travel safety briefing for a destination.
    Includes safety level (1–5), common risks, recommended precautions,
    emergency number format, and best travel seasons.
    Returns a plain-text structured briefing.
    """
    destination = destination.strip()
    llm = get_chain_llm(temperature=0.1)

    prompt = f"""You are a professional travel safety analyst.
Provide a concise, factual travel safety briefing for: {destination}

Structure your response exactly as follows:

**Safety Level:** X/5  (1=very unsafe, 5=very safe)
**Overall Assessment:** One sentence summary.

**Main Risks:**
- Risk 1
- Risk 2
- Risk 3

**Recommended Precautions:**
- Precaution 1
- Precaution 2
- Precaution 3

**Emergency Numbers:** Format (e.g. Police: 100, Ambulance: 102)
**Best Time to Visit:** Month range and reason.
**Visa Required for Indian Citizens:** Yes / No / On arrival.

Keep each bullet point to one line. Be factual and neutral."""

    response = llm.invoke(prompt)
    return response.content


# ── Headlines Tool ────────────────────────────────────────────────────────────

@tool
def get_headlines(topic: str = "world news") -> str:
    """
    Get the top 5 current news headlines for a topic using Tavily news search.
    Returns a JSON array of {title, source, url, published_date} objects.
    """
    from news import search_news
    try:
        articles = search_news(topic.strip(), days=2)[:5]
        headlines = [
            {
                "title":          a["title"],
                "source":         a["source"],
                "url":            a["url"],
                "published_date": a["published_date"],
            }
            for a in articles
        ]
        return json.dumps(headlines)
    except Exception as exc:
        return json.dumps({"error": str(exc)})


# ── Dashboard Chat Agent ──────────────────────────────────────────────────────

_DASHBOARD_SYSTEM = """You are an intelligent travel and news assistant with access to \
real-time weather data, current news headlines, and travel safety analysis tools.

When answering:
- Use tools to fetch live data — never guess current conditions or news.
- Be concise and structured in your response.
- For weather queries, always state the city name and current conditions first.
- For travel safety, always include the safety level score.
- For news, list headlines with their source.
- If a query spans multiple tools (e.g. "weather and safety in Tokyo"), use all relevant tools.
"""

def run_dashboard_agent(query: str) -> str:
    """
    Run the dashboard conversational agent.
    Uses get_weather, get_travel_safety, and get_headlines tools.
    Returns a plain-text response string.
    """
    llm   = get_tool_llm()
    tools = [get_weather, get_travel_safety, get_headlines]

    full_prompt = f"{_DASHBOARD_SYSTEM}\n\nUser query: {query}"
    return _run_tool_loop(llm, tools, full_prompt)
