import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api.routes.sessions import router as sessions_router
from backend.api.routes.transactions import _is_encryption_error, _password_protected_pdf_error
from backend.database import Base
from backend.services.session_service import SessionService


class PasswordProtectedPdfErrorTests(unittest.TestCase):
    def test_encryption_valueerror_is_detected(self):
        self.assertTrue(_is_encryption_error(ValueError("PDF is encrypted and requires a valid password")))
        self.assertFalse(_is_encryption_error(ValueError("unrelated value error")))
        self.assertFalse(_is_encryption_error(RuntimeError("encrypted")))

    def test_error_lists_all_pdf_names(self):
        err = _password_protected_pdf_error(["a.pdf", "b.pdf"])
        self.assertEqual(err.status_code, 400)
        self.assertIn("a.pdf", err.detail)
        self.assertIn("b.pdf", err.detail)


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
