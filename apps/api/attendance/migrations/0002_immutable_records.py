from django.db import migrations

SQL = """
CREATE FUNCTION zenvik_attendance_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Attendance originals are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER attendance_event_immutable BEFORE UPDATE OR DELETE ON attendance_attendanceevent
FOR EACH ROW EXECUTE FUNCTION zenvik_attendance_immutable();
CREATE TRIGGER attendance_policy_revision_immutable BEFORE UPDATE OR DELETE ON attendance_attendancepolicyrevision
FOR EACH ROW EXECUTE FUNCTION zenvik_attendance_immutable();
CREATE FUNCTION zenvik_attendance_identity() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM attendance_attendancesession s WHERE s.id = NEW.session_id
     AND s.business_id = NEW.business_id AND s.employee_id = NEW.employee_id AND s.user_id = NEW.actor_id) THEN
    RAISE EXCEPTION 'Attendance identity mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER attendance_event_identity BEFORE INSERT ON attendance_attendanceevent
FOR EACH ROW EXECUTE FUNCTION zenvik_attendance_identity();
"""
REVERSE = """
DROP TRIGGER attendance_event_identity ON attendance_attendanceevent;
DROP FUNCTION zenvik_attendance_identity();
DROP TRIGGER attendance_event_immutable ON attendance_attendanceevent;
DROP TRIGGER attendance_policy_revision_immutable ON attendance_attendancepolicyrevision;
DROP FUNCTION zenvik_attendance_immutable();
"""


class Migration(migrations.Migration):
    dependencies = [('attendance', '0001_initial')]
    operations = [migrations.RunSQL(SQL, REVERSE)]
