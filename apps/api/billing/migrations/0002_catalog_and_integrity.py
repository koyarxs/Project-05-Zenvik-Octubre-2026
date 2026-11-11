from django.db import migrations


def seed(apps, schema_editor):
    Plan = apps.get_model('billing', 'Plan')
    Version = apps.get_model('billing', 'PlanVersion')
    Subscription = apps.get_model('billing', 'Subscription')
    Business = apps.get_model('businesses', 'Business')
    base = ['employees', 'shifts', 'leaves', 'worker_portal']
    operational = ['attendance', 'geolocation', 'geofences', 'incidents', 'notifications', 'exports']
    for position, (code, name, description, features) in enumerate([
        ('basico', 'Básico', 'Trabajadores, planificación y solicitudes para equipos pequeños.', base),
        ('profesional', 'Profesional', 'Gestión operativa ampliada. Asistencia sujeta a las condiciones de uso habilitadas.', base + operational),
        ('premium', 'Premium', 'Gestión operativa y reportes. Condiciones comerciales por definir.', base + operational + ['reports']),
    ]):
        plan = Plan.objects.create(code=code, name=name, description=description, sort_order=position, published=True)
        Version.objects.create(plan=plan, number=1, features=features, limits={}, trial_days=0)
    for business in Business.objects.all().iterator():
        Subscription.objects.get_or_create(business_id=business.pk, defaults={'legacy_access': True, 'state': 'PENDING'})


SQL = """
CREATE FUNCTION zenvik_billing_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Billing evidence is immutable';
END; $$;
CREATE TRIGGER billing_audit_immutable BEFORE UPDATE OR DELETE ON billing_billingaudit
FOR EACH ROW EXECUTE FUNCTION zenvik_billing_immutable();
CREATE TRIGGER billing_event_immutable BEFORE UPDATE OR DELETE ON billing_providerevent
FOR EACH ROW EXECUTE FUNCTION zenvik_billing_immutable();
CREATE TRIGGER billing_version_immutable BEFORE UPDATE OR DELETE ON billing_planversion
FOR EACH ROW EXECUTE FUNCTION zenvik_billing_immutable();
CREATE FUNCTION zenvik_billing_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Billing history cannot be deleted'; END IF;
  IF TG_TABLE_NAME = 'billing_price' THEN
    IF (to_jsonb(NEW) - 'published') IS DISTINCT FROM (to_jsonb(OLD) - 'published') THEN
      RAISE EXCEPTION 'Create a new immutable price';
    END IF;
  ELSE
    IF (to_jsonb(NEW) - ARRAY['state','paid_at','provider_reference']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['state','paid_at','provider_reference']) THEN
      RAISE EXCEPTION 'Order snapshot is immutable';
    END IF;
    IF OLD.state = 'PAID' AND NEW.state NOT IN ('PAID','REFUNDED') THEN
      RAISE EXCEPTION 'A paid order cannot regress';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER billing_price_snapshot BEFORE UPDATE OR DELETE ON billing_price
FOR EACH ROW EXECUTE FUNCTION zenvik_billing_snapshot();
CREATE TRIGGER billing_order_snapshot BEFORE UPDATE OR DELETE ON billing_paymentorder
FOR EACH ROW EXECUTE FUNCTION zenvik_billing_snapshot();
"""
REVERSE = """
DROP TRIGGER billing_order_snapshot ON billing_paymentorder;
DROP TRIGGER billing_price_snapshot ON billing_price;
DROP TRIGGER billing_version_immutable ON billing_planversion;
DROP TRIGGER billing_event_immutable ON billing_providerevent;
DROP TRIGGER billing_audit_immutable ON billing_billingaudit;
DROP FUNCTION zenvik_billing_snapshot();
DROP FUNCTION zenvik_billing_immutable();
"""


class Migration(migrations.Migration):
    dependencies = [('billing', '0001_initial')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop), migrations.RunSQL(SQL, REVERSE)]
