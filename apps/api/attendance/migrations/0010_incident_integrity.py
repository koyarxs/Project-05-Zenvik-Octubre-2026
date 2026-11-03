from django.db import migrations

SQL = '''
CREATE TRIGGER incident_decision_immutable BEFORE UPDATE OR DELETE ON attendance_incidentdecision FOR EACH ROW EXECUTE FUNCTION zenvik_attendance_immutable();
CREATE TRIGGER incident_correction_immutable BEFORE UPDATE OR DELETE ON attendance_attendancecorrection FOR EACH ROW EXECUTE FUNCTION zenvik_attendance_immutable();
CREATE TRIGGER incident_audit_immutable BEFORE UPDATE OR DELETE ON attendance_attendanceaudit FOR EACH ROW EXECUTE FUNCTION zenvik_attendance_immutable();
CREATE FUNCTION zenvik_incident_original() RETURNS trigger AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Incident evidence cannot be deleted'; END IF;
 IF (to_jsonb(NEW) - ARRAY['status','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','version','updated_at']) THEN
   RAISE EXCEPTION 'Incident declarations are immutable';
 END IF;
 IF NEW.version != OLD.version + 1 OR NOT ((OLD.status='PENDING' AND NEW.status IN ('IN_REVIEW','APPROVED','REJECTED','CANCELLED')) OR (OLD.status='IN_REVIEW' AND NEW.status IN ('APPROVED','REJECTED'))) THEN
   RAISE EXCEPTION 'Invalid incident transition';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER incident_original BEFORE UPDATE OR DELETE ON attendance_attendanceincident FOR EACH ROW EXECUTE FUNCTION zenvik_incident_original();
CREATE FUNCTION zenvik_incident_identity() RETURNS trigger AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM employees e WHERE e.id=NEW.employee_id AND e.business_id=NEW.business_id AND e.user_id=NEW.requester_id) THEN RAISE EXCEPTION 'Invalid incident employee identity'; END IF;
 IF NEW.session_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM attendance_attendancesession s WHERE s.id=NEW.session_id AND s.business_id=NEW.business_id AND s.employee_id=NEW.employee_id AND s.user_id=NEW.requester_id AND s.work_date=NEW.work_date) THEN RAISE EXCEPTION 'Invalid incident session'; END IF;
 IF NEW.event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM attendance_attendanceevent e WHERE e.id=NEW.event_id AND e.session_id=NEW.session_id AND e.business_id=NEW.business_id AND e.actor_id=NEW.requester_id AND e.employee_id=NEW.employee_id) THEN RAISE EXCEPTION 'Invalid incident event'; END IF;
 IF NEW.shift_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM shifts s WHERE s.id=NEW.shift_id AND s.business_id=NEW.business_id AND s.employee_id=NEW.employee_id) THEN RAISE EXCEPTION 'Invalid incident shift'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER incident_identity BEFORE INSERT ON attendance_attendanceincident FOR EACH ROW EXECUTE FUNCTION zenvik_incident_identity();
CREATE FUNCTION zenvik_notification_original() RETURNS trigger AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Notification evidence cannot be deleted'; END IF;
 IF (to_jsonb(NEW) - 'read_at') IS DISTINCT FROM (to_jsonb(OLD) - 'read_at') OR (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at) THEN RAISE EXCEPTION 'Notification content is immutable'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER notification_original BEFORE UPDATE OR DELETE ON attendance_attendancenotification FOR EACH ROW EXECUTE FUNCTION zenvik_notification_original();
'''
REVERSE = '''
DROP TRIGGER notification_original ON attendance_attendancenotification;
DROP FUNCTION zenvik_notification_original();
DROP TRIGGER incident_identity ON attendance_attendanceincident;
DROP FUNCTION zenvik_incident_identity();
DROP TRIGGER incident_original ON attendance_attendanceincident;
DROP FUNCTION zenvik_incident_original();
DROP TRIGGER incident_decision_immutable ON attendance_incidentdecision;
DROP TRIGGER incident_correction_immutable ON attendance_attendancecorrection;
DROP TRIGGER incident_audit_immutable ON attendance_attendanceaudit;
'''

class Migration(migrations.Migration):
    dependencies = [('attendance', '0009_incidentpolicy_attendanceincident_and_more')]
    operations = [migrations.RunSQL(SQL, REVERSE)]
