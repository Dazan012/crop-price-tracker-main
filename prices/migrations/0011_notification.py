# Migration: Add Notification model for real-time notification system

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('prices', '0010_regionroute_road_condition'),
        migrations.swappable_dependency('auth.User') if hasattr(migrations, 'swappable_dependency') else ('auth', '__first__'),
    ]

    operations = [
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('type', models.CharField(choices=[
                    ('price_alert', 'Price Alert'),
                    ('opportunity', 'Market Opportunity'),
                    ('transport', 'Transport Alert'),
                    ('system', 'System'),
                ], default='system', max_length=20)),
                ('priority', models.CharField(choices=[
                    ('high', 'High'),
                    ('medium', 'Medium'),
                    ('low', 'Low'),
                ], default='medium', max_length=10)),
                ('title', models.CharField(max_length=300)),
                ('message', models.TextField()),
                ('region', models.CharField(blank=True, max_length=100)),
                ('crop', models.CharField(blank=True, help_text='Crop name (nullable)', max_length=100, null=True)),
                ('read', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notifications',
                    to='auth.user',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(
                fields=['user', 'read', '-created_at'],
                name='prices_noti_user_id_1a2b3c_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(
                fields=['user', 'type', '-created_at'],
                name='prices_noti_user_id_4d5e6f_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(
                fields=['type', 'crop', 'region', '-created_at'],
                name='prices_noti_type_7g8h9i_idx',
            ),
        ),
    ]
