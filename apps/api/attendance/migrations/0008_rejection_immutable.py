from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [('attendance', '0007_attendancerejection')]
    operations = [migrations.RunSQL('CREATE TRIGGER attendance_rejection_immutable BEFORE UPDATE OR DELETE ON attendance_attendancerejection FOR EACH ROW EXECUTE FUNCTION zenvik_attendance_immutable();', 'DROP TRIGGER attendance_rejection_immutable ON attendance_attendancerejection;')]
