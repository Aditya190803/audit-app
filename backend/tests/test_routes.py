import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api.routes.sessions import router as sessions_router
from backend.database import Base
from backend.services.session_service import SessionService


class RouteOrderTests(unittest.TestCase):
    def test_sessions_recovery_route_precedes_dynamic_session_id_route(self):
        paths = [route.path for route in sessions_router.routes]
        self.assertLess(paths.index("/sessions/recovery"), paths.index("/sessions/{session_id}"))


class RecoveryStateTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()

    def test_completed_sessions_are_not_recovery_candidates(self):
        service = SessionService(self.db)
        completed = service.create_session(name="done")
        service.mark_session_status(completed.id, "completed")

        self.assertIsNone(service.get_crash_recovery_session())

        active = service.create_session(name="interrupted")
        recovered = service.get_crash_recovery_session()

        self.assertIsNotNone(recovered)
        self.assertEqual(recovered.id, active.id)
