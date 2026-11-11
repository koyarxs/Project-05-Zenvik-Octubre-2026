from time import time

from django.conf import settings
from django.contrib.auth import logout

STARTED = 'app_session_started_at'
LAST_ACTIVITY = 'app_session_last_activity_at'
LAST_SEEN = 'app_session_last_seen_at'
IDLE_SECONDS = 15 * 60
PRESENCE_SECONDS = 2 * 60


def start_app_session(session):
    now = int(time())
    session[STARTED] = session[LAST_ACTIVITY] = now
    session.pop(LAST_SEEN, None)
    session.set_expiry(0)


def expiry_at(session):
    expiry = min(session[LAST_ACTIVITY] + IDLE_SECONDS, session[STARTED] + settings.SESSION_COOKIE_AGE)
    last_seen = session.get(LAST_SEEN)
    return expiry if last_seen is None else min(expiry, last_seen + PRESENCE_SECONDS)


def session_times(session):
    return {
        'session_started_at': session[STARTED],
        'session_expires_at': expiry_at(session),
        'session_server_time': int(time()),
    }


class AppSessionExpiryMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if STARTED in request.session and time() >= expiry_at(request.session):
            logout(request)
        return self.get_response(request)
