from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [('attendance', '0004_attendancereview')]
    operations = [migrations.RunSQL('CREATE TRIGGER attendance_review_immutable BEFORE UPDATE OR DELETE ON attendance_attendancereview FOR EACH ROW EXECUTE FUNCTION zenvik_attendance_immutable();', 'DROP TRIGGER attendance_review_immutable ON attendance_attendancereview;')]
