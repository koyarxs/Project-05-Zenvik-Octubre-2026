from datetime import timedelta
from unittest.mock import patch
from django.db import DatabaseError, transaction
from django.test import TestCase
from rest_framework.test import APIClient
from businesses.models import Business, Employee, Membership, Shift, LeaveRequest
from .tests import fixture, payload, validated, NOW
from .services import record_event
from .models import AttendanceSession, AttendanceReview

class SupervisionTests(TestCase):
    def setUp(self):
        self.business, self.owner, self.user, self.peer, self.employee = fixture()
        self.client = APIClient()
        self.client.force_login(self.owner)
        self.base = f'/api/v1/businesses/{self.business.pk}/attendance/supervision/'
        self.day = NOW.date().isoformat()

    def mark(self, kind='CLOCK_IN', session=None, **extra):
        with patch('attendance.services.timezone.now', return_value=NOW):
            return record_event(self.user, self.business.pk, validated(payload(kind, session, **extra)))[0]

    def get(self, suffix='', **query):
        with patch('attendance.supervision.timezone.now', return_value=NOW):
            return self.client.get(self.base + suffix, {'date': self.day, **query})

    def test_live_states_and_four_marks(self):
        for kind, state in [('CLOCK_IN','WORKING'), ('BREAK_START','ON_BREAK'), ('BREAK_END','WORKING'), ('CLOCK_OUT','FINISHED')]:
            self.mark(kind, AttendanceSession.objects.first())
            response = self.get(search='Clara')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['results'][0]['state'], state)
            self.assertEqual(response.data['summary'][state], 1)
        detail = self.get(f'people/{self.employee.pk}/')
        self.assertEqual(len(detail.data['results'][0]['events']), 4)
        self.assertNotIn('latitude', str(detail.data))

    def test_dashboard_timeline_counts_real_entries_once(self):
        self.mark()
        response = self.get(dashboard='true')
        self.assertEqual(response.status_code, 200, response.data)
        dashboard = response.data['dashboard']
        self.assertEqual([point['hour'] for point in dashboard['entries']], list(range(0, 24, 2)))
        self.assertEqual(sum(point['count'] for point in dashboard['entries']), 1)
        self.assertEqual(dashboard['completed_shifts'], 0)
        self.assertNotIn('dashboard', self.get().data)

    def test_pending_future_unscheduled_and_leave(self):
        self.assertEqual(self.get(search='Clara').data['results'][0]['state'], 'UNSCHEDULED')
        shift = Shift.objects.create(business=self.business, employee=self.employee, starts_at=NOW+timedelta(minutes=5), ends_at=NOW+timedelta(hours=2))
        self.assertEqual(self.get(search='Clara').data['results'][0]['state'], 'FUTURE')
        shift.starts_at = NOW-timedelta(hours=1); shift.save()
        self.assertEqual(self.get(search='Clara').data['results'][0]['state'], 'PENDING')
        leave = LeaveRequest.objects.create(business=self.business, employee=self.employee, requested_by=self.user, start_date=NOW.date(), end_date=NOW.date(), request_type='OTHER', reason='Prueba')
        leave.status = 'APPROVED'; leave.reviewed_by = self.owner; leave.reviewed_at = NOW; leave.review_note = 'Aprobado'; leave.save()
        self.assertEqual(self.get(search='Clara').data['results'][0]['state'], 'LEAVE')

    def test_night_snapshot_lateness_and_incomplete(self):
        shift = Shift.objects.create(business=self.business, employee=self.employee, starts_at=NOW-timedelta(minutes=7), ends_at=NOW+timedelta(hours=2))
        self.mark()
        row = self.get(search='Clara').data['results'][0]
        self.assertEqual(row['session']['start_difference_minutes'], 7)
        self.assertIn('POSSIBLE_LATE', row['session']['incidents'])
        later = NOW + timedelta(hours=3)
        with patch('attendance.supervision.timezone.now', return_value=later):
            row = self.client.get(self.base, {'date': later.date().isoformat(), 'search':'Clara'}).data['results'][0]
        self.assertEqual(row['session']['work_date'], self.day)
        self.assertIn('INCOMPLETE', row['session']['incidents'])
        shift.refresh_from_db(); self.assertEqual(shift.starts_at, NOW-timedelta(minutes=7))

    def test_geo_and_review_preserve_originals_and_conflict(self):
        event = self.mark(location=None, location_status='DENIED', exception_reason='Dispositivo sin ubicación disponible')
        row = self.get(search='Clara').data['results'][0]
        self.assertIn('MISSING_LOCATION', row['session']['incidents'])
        data = {'state':'RESOLVED', 'reason':'Revisado con el trabajador.', 'expected_review':0}
        response = self.client.post(self.base+f'reviews/{event.session_id}/', data, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.client.post(self.base+f'reviews/{event.session_id}/', data, format='json').status_code, 409)
        event.refresh_from_db(); self.assertEqual(event.location_status, 'DENIED')
        row = self.get(search='Clara').data['results'][0]
        self.assertEqual(row['session']['reviews'][0]['actor'], self.owner.username)
        with self.assertRaises(DatabaseError), transaction.atomic():
            AttendanceReview.objects.update(reason='silent overwrite')

    def test_permissions_all_endpoints_and_foreign_ids(self):
        event = self.mark()
        suffixes = ['', 'reports/', 'export/', f'people/{self.employee.pk}/']
        self.client.force_login(self.user)
        for suffix in suffixes:
            self.assertEqual(self.get(suffix).status_code, 403)
        self.assertEqual(self.client.post(self.base+f'reviews/{event.session_id}/', {}, format='json').status_code, 403)
        self.client.force_login(self.owner)
        other = Business.objects.create(name='Foreign')
        foreign = Employee.objects.create(business=other, first_name='Private', last_name='Person')
        self.assertEqual(self.get(f'people/{foreign.pk}/').status_code, 404)
        for suffix in suffixes:
            self.assertEqual(self.client.get(self.base.replace(str(self.business.pk), str(other.pk))+suffix).status_code, 404)
        Membership.objects.filter(user=self.owner).update(role='ADMIN')
        self.assertEqual(self.get().status_code, 200)

    def test_filters_pagination_validation_and_reports(self):
        for i in range(12):
            Employee.objects.create(business=self.business, first_name=f'Person{i}', last_name='Test', job_title='Cocina')
        self.assertEqual(self.get(job_title='Cocina').data['count'], 12)
        self.assertEqual(len(self.get(job_title='Cocina').data['results']), 10)
        self.assertEqual(len(self.get(job_title='Cocina', page=2).data['results']), 2)
        for query in [{'ordering':'password'}, {'page':0}, {'date':'invalid'}, {'state':'ABSENT'}, {'unknown':'x'}]:
            self.assertEqual(self.get(**query).status_code, 400)
        for period, days in [('daily',1), ('weekly',7), ('monthly',30)]:
            report = self.get('reports/', period=period, search='Clara')
            self.assertEqual(report.status_code, 200, report.data)
            self.assertEqual(report.data['count'], days)

    def test_export_bom_metadata_and_formula_protection(self):
        self.employee.first_name = '=HYPERLINK("example")'; self.employee.save()
        self.mark()
        response = self.get('export/')
        self.assertEqual(response.status_code, 200)
        content = response.content.decode('utf-8-sig')
        self.assertTrue(response.content.startswith(b'\xef\xbb\xbf'))
        self.assertIn("'=HYPERLINK", content)
        self.assertIn('America/Santiago', content)
        self.assertIn('Attendance test', content)
        self.assertNotIn('latitude', content)
        self.assertIn('no-store', response['Cache-Control'])
    def test_rejected_attempts_are_real_and_scoped(self):
        from .models import AttendanceRejection
        self.client.force_login(self.user)
        data = payload()
        first = self.client.post(self.base.replace('supervision/', '') + 'events/', data, format='json')
        self.assertEqual(first.status_code, 201)
        data['location']['accuracy_meters'] = 99
        self.assertEqual(self.client.post(self.base.replace('supervision/', '') + 'events/', data, format='json').status_code, 409)
        rejection = AttendanceRejection.objects.get()
        self.assertEqual(rejection.code, 'DUPLICATE_REJECTED')
        self.assertEqual(rejection.actor, self.user)
        self.client.force_login(self.owner)
        day = rejection.recorded_at.astimezone(__import__('zoneinfo').ZoneInfo('America/Santiago')).date().isoformat()
        detail = self.get(f'people/{self.employee.pk}/', date=day)
        self.assertEqual(detail.data['rejection_count'], 1)
        self.assertNotIn('latitude', str(detail.data['rejections']))
        with self.assertRaises(DatabaseError), transaction.atomic():
            AttendanceRejection.objects.all().delete()

    def test_multiple_journeys_report_and_state_filter(self):
        self.mark()
        self.mark('CLOCK_OUT', AttendanceSession.objects.first())
        self.mark()
        report = self.get('reports/', search='Clara')
        self.assertEqual(report.data['count'], 2)
        self.assertEqual({row['state'] for row in report.data['results']}, {'WORKING', 'FINISHED'})
        self.assertEqual(self.get('reports/', search='Clara', state='FINISHED').data['count'], 1)
        self.assertEqual(self.get(search='Clara').data['count'], 1)

    def test_csrf_review_foreign_session_and_read_limit(self):
        from django.contrib.auth import get_user_model
        from .models import AttendanceSession
        import uuid
        event = self.mark()
        csrf = APIClient(enforce_csrf_checks=True); csrf.force_login(self.owner)
        self.assertEqual(csrf.post(self.base + f'reviews/{event.session_id}/', {}, format='json').status_code, 403)
        self.assertEqual(self.client.post(self.base + f'reviews/{uuid.uuid4()}/', {}, format='json').status_code, 404)
        with patch('attendance.supervision.reserve_auth_attempt') as reserve:
            self.get()
            self.assertEqual(reserve.call_args.args[0][0][1:], (120, 60))
            self.get('export/')
            self.assertEqual(reserve.call_args.args[0][0][1:], (12, 60))
