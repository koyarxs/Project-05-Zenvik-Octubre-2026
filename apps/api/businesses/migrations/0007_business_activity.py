from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('businesses', '0006_personnel_profiles')]

    operations = [
        migrations.CreateModel(
            name='BusinessActivity',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(max_length=10)),
                ('occurred_at', models.DateTimeField()),
                ('business', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='businesses.business')),
            ],
            options={'indexes': [models.Index(fields=['-occurred_at', '-id'], name='business_activity_recent_idx')]},
        ),
        migrations.RunSQL(
            """
            CREATE FUNCTION record_business_activity() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    INSERT INTO businesses_businessactivity (business_id, kind, occurred_at)
                    VALUES (NEW.id, 'created', NEW.created_at);
                ELSIF ROW(OLD.name, OLD.rut, OLD.is_active, OLD.planning_max_minutes,
                          OLD.planning_block_leave, OLD.planning_timezone)
                      IS DISTINCT FROM
                      ROW(NEW.name, NEW.rut, NEW.is_active, NEW.planning_max_minutes,
                          NEW.planning_block_leave, NEW.planning_timezone) THEN
                    INSERT INTO businesses_businessactivity (business_id, kind, occurred_at)
                    VALUES (NEW.id, 'updated', clock_timestamp());
                END IF;
                RETURN NEW;
            END;
            $$;
            CREATE TRIGGER business_activity_after_write AFTER INSERT OR UPDATE ON businesses
            FOR EACH ROW EXECUTE FUNCTION record_business_activity();
            INSERT INTO businesses_businessactivity (business_id, kind, occurred_at)
            SELECT id, 'created', created_at FROM businesses;
            """,
            reverse_sql="""
                DROP TRIGGER business_activity_after_write ON businesses;
                DROP FUNCTION record_business_activity();
            """,
        ),
    ]
