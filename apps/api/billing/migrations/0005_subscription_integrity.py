from django.db import migrations

SQL = """
CREATE FUNCTION zenvik_billing_subscription_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE price_version uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'Subscription business is immutable';
  END IF;
  IF NEW.price_id IS NOT NULL THEN
    SELECT version_id INTO price_version FROM billing_price WHERE id = NEW.price_id;
    IF price_version IS DISTINCT FROM NEW.version_id THEN
      RAISE EXCEPTION 'Subscription price version mismatch';
    END IF;
  END IF;
  IF NEW.state IN ('ACTIVE','TRIALING','PAST_DUE') AND
     (NEW.legacy_access OR NEW.version_id IS NULL OR NEW.period_start IS NULL OR NEW.period_end IS NULL OR
      (NEW.state <> 'TRIALING' AND NEW.price_id IS NULL)) THEN
    RAISE EXCEPTION 'Subscription requires explicit commercial period';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER billing_subscription_integrity BEFORE INSERT OR UPDATE ON billing_subscription
FOR EACH ROW EXECUTE FUNCTION zenvik_billing_subscription_check();
"""


class Migration(migrations.Migration):
    dependencies = [('billing', '0004_remove_subscription_billing_subscription_period_and_more')]
    operations = [migrations.RunSQL(SQL, 'DROP TRIGGER billing_subscription_integrity ON billing_subscription; DROP FUNCTION zenvik_billing_subscription_check();')]
