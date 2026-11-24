import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

// Django mounts everything under /api/eval-bot/ (eval_platform_be/urls.py), so
// the prefix lives here and no call site repeats it.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/eval-bot/';

// Trailing slash required: Django's APPEND_SLASH redirects a POST to /foo as a
// GET to /foo/, which silently loses the body. Normalised once rather than
// trusted to every endpoint string.
const BASE_URL = API_URL.endsWith('/') ? API_URL : `${API_URL}/`;

/** Our own per-request flags. Not sent — axios ignores unknown config keys. */
type Req = InternalAxiosRequestConfig & {
    /** set once a request has already been replayed after a refresh */
    _retried?: boolean;
    /** opt a request out of the refresh dance entirely (the refresh call itself) */
    _noRefresh?: boolean;
};

export const http = axios.create({
    baseURL: BASE_URL,
    // The access and refresh JWTs are httpOnly cookies set by LoginView, so JS
    // never reads them and the browser attaches them itself. Nothing readable
    // means nothing for an XSS to exfiltrate (OWASP A02/A07).
    withCredentials: true,
});

// ---------------------------------------------------------------------------
// Session-lost hook
// ---------------------------------------------------------------------------

/** Non-sensitive "who is logged in" hint for route gating. Never the token. */
const PROFILE_KEY = 'profile';

export const loadProfile = (): { username: string; userid: number; role: string } | null => {
    try {
        return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    } catch {
        return null;
    }
};

export const saveProfile = (p: unknown) => localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
export const clearProfile = () => localStorage.removeItem(PROFILE_KEY);

// NOTE: the login page currently lives at '/'. When it moves to its own route,
// change this to '/login' (and update the <Route> in App.tsx to match).
const LOGIN_PATH = '/';

/** Where to send someone whose session is gone, carrying the page they wanted. */
export const loginPathFor = (loc: Location) => {
    const next = `${loc.pathname}${loc.search}`;
    // Already on the login page (or the site root): no point remembering it.
    return loc.pathname === LOGIN_PATH || loc.pathname === '/'
        ? LOGIN_PATH
        : `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
};

// Four parallel requests on a dead session each reach the giving-up path, and
// each would fire a navigation. Latch it so the app leaves exactly once.
let lost = false;

const onSessionLost = () => {
    if (lost) return;
    lost = true;
    clearProfile();
    // A full page load, outside the router, so the target rides in the URL
    // rather than router state.
    window.location.href = loginPathFor(window.location);
};

// ---------------------------------------------------------------------------
// Refresh, single-flight
// ---------------------------------------------------------------------------

// ONE in-flight refresh, shared by every caller that 401s while it runs. A
// dashboard that fires four loads in parallel hits four 401s at once; four
// refreshes would race, and the moment ROTATE_REFRESH_TOKENS actually rotates
// (settings.py asks for it — the view does not do it yet, and
// token_blacklist is not installed) the losers present a spent token and the
// user is logged out mid-session. Cheap insurance against a bug that only
// appears once the backend is finished.
let refreshing: Promise<unknown> | null = null;

const refresh = () => {
    refreshing ??= http
        // _noRefresh: a 401 from the refresh endpoint means the session is
        // genuinely gone. Without the flag the interceptor would try to refresh
        // the refresh, forever.
        .post('auth/refresh', null, { _noRefresh: true } as Partial<Req>)
        .finally(() => {
            refreshing = null;
        });
    return refreshing;
};

// Paths where a 401 is an ANSWER, not an expired token. Refreshing or
// redirecting on these is always wrong:
//   auth/login   — the 401 *is* the "Incorrect Password!" message; a redirect
//                  reloads the page and wipes it before it can be read
//   auth/refresh — means the session is genuinely gone; its caller handles that
//   auth/logout  — already the desired state
const AUTH_PATHS = ['auth/login', 'auth/refresh', 'auth/logout'];

http.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const config = error.config as Req | undefined;

        // Anything that isn't an expired access token is the caller's problem.
        if (error.response?.status !== 401 || !config) throw error;

        if (config._noRefresh || AUTH_PATHS.some((p) => config.url?.includes(p))) throw error;

        // Already replayed once and still 401: refreshing again would loop.
        if (config._retried) {
            onSessionLost();
            throw error;
        }

        config._retried = true;
        try {
            await refresh();
        } catch {
            onSessionLost();
            throw error;
        }

        // Returning a request from a REJECTED response interceptor is what makes
        // this work: axios resolves the original caller with whatever this
        // promise settles to. ofetch's onResponseError cannot do this — it awaits
        // the hook, discards the return value and throws the original error
        // anyway, so the same code there refreshes the token and then hands the
        // caller the 401 it just fixed.
        return http(config);
    },
);
