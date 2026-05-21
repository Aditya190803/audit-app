import unittest

from backend.api.routes.sessions import router as sessions_router


class RouteOrderTests(unittest.TestCase):
    def test_sessions_recovery_route_precedes_dynamic_session_id_route(self):
        paths = [route.path for route in sessions_router.routes]
        self.assertLess(paths.index("/sessions/recovery"), paths.index("/sessions/{session_id}"))
