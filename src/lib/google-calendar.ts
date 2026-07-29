export type GoogleCalendar = {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
};

export type GoogleCalendarEvent = {
  id: string;
  calendarId: string;
  calendarName: string;
  event_date: string;
  start_time: string;
  end_time: string;
  title: string;
  htmlLink?: string;
  color?: string;
  source: "google";
};

const CALENDAR_TOKEN_KEY = "google_calendar_access_token";
const CALENDAR_SELECTION_KEY = "google_calendar_selected_ids";
const CALENDAR_STATE_KEY = "google_calendar_oauth_state";

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getStoredGoogleCalendarToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(CALENDAR_TOKEN_KEY) || "";
}

export function saveStoredGoogleCalendarToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (!token) {
    localStorage.removeItem(CALENDAR_TOKEN_KEY);
    return;
  }
  localStorage.setItem(CALENDAR_TOKEN_KEY, token);
}

export function getStoredGoogleCalendarSelection() {
  if (typeof window === "undefined") return [] as string[];
  return safeJsonParse<string[]>(localStorage.getItem(CALENDAR_SELECTION_KEY), []);
}

export function saveStoredGoogleCalendarSelection(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CALENDAR_SELECTION_KEY, JSON.stringify(ids));
}

export function normalizeCalendarSelection(selectedIds: string[], calendars: GoogleCalendar[]) {
  const validIds = new Set(calendars.map((calendar) => calendar.id));
  const unique = new Set<string>();

  return selectedIds.filter((id) => {
    if (!validIds.has(id) || unique.has(id)) return false;
    unique.add(id);
    return true;
  });
}

export function buildGoogleCalendarAuthUrl() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "Missing VITE_GOOGLE_CLIENT_ID in environment. Add it to your .env and restart the app, then configure Google OAuth redirect URI to: " + `${window.location.origin}/settings`
    );
  }

  const redirectUri = `${window.location.origin}/settings`;
  const scope = "https://www.googleapis.com/auth/calendar.readonly";
  const state = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(CALENDAR_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function consumeGoogleCalendarTokenFromHash() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  const token = params.get("access_token");
  const returnedState = params.get("state");
  const error = params.get("error");
  const storedState = localStorage.getItem(CALENDAR_STATE_KEY);

  if (error) {
    localStorage.removeItem(CALENDAR_STATE_KEY);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    return null;
  }

  if (!token || (storedState && returnedState !== storedState)) {
    localStorage.removeItem(CALENDAR_STATE_KEY);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    return null;
  }

  saveStoredGoogleCalendarToken(token);
  localStorage.removeItem(CALENDAR_STATE_KEY);
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return token;
}

export async function listGoogleCalendars(accessToken: string): Promise<GoogleCalendar[]> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to fetch Google calendars");
  }

  const json = await res.json();
  return (json.items || []).map((item: any) => ({
    id: item.id,
    summary: item.summary || item.id,
    primary: !!item.primary,
    backgroundColor: item.backgroundColor,
  }));
}

function toDateOnlyText(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

function toTimeText(value: string, fallback = "00:00") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString().slice(11, 16);
}

export async function listGoogleCalendarEvents(
  accessToken: string,
  selectedCalendarIds: string[],
  timeMin: string,
  timeMax: string,
): Promise<GoogleCalendarEvent[]> {
  if (!selectedCalendarIds.length) return [];

  const all = await Promise.all(
    selectedCalendarIds.map(async (calendarId) => {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set("timeMin", `${timeMin}T00:00:00.000Z`);
      url.searchParams.set("timeMax", `${timeMax}T23:59:59.999Z`);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        return [] as GoogleCalendarEvent[];
      }

      const json = await res.json();
      const items = json.items || [];

      return items.map((event: any) => {
        const start = event.start?.dateTime || event.start?.date || "";
        const end = event.end?.dateTime || event.end?.date || "";
        const dateOnly = toDateOnlyText(start || event.created || new Date().toISOString());

        const startTime = start.includes("T") ? toTimeText(start, "00:00") : "00:00";
        const endTime = end.includes("T") ? toTimeText(end, "23:59") : "23:59";

        return {
          id: `google-${calendarId}-${event.id}`,
          calendarId,
          calendarName: event.organizer?.displayName || calendarId,
          event_date: dateOnly,
          start_time: startTime,
          end_time: endTime,
          title: event.summary || "Untitled",
          htmlLink: event.htmlLink,
          color: event.colorId,
          source: "google" as const,
        };
      });
    }),
  );

  return all.flat();
}
