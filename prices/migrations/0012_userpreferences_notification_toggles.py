# Migration: Add granular notification preference fields to UserPreferences

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('prices', '0011_notification'),
    ]

    operations = [
        migrations.AddField(
            model_name='userpreferences',
            name='notifications_enabled',
            field=models.BooleanField(
                default=True,
                help_text='Master switch: enable/disable all in-app notifications',
            ),
        ),
        migrations.AddField(
            model_name='userpreferences',
            name='opportunity_alerts',
            field=models.BooleanField(
                default=True,
                help_text='Market arbitrage opportunity alerts',
            ),
        ),
        migrations.AddField(
            model_name='userpreferences',
            name='transport_alerts',
            field=models.BooleanField(
                default=True,
                help_text='Transport cost change alerts',
            ),
        ),
        migrations.AddField(
            model_name='userpreferences',
            name='personalized_alerts',
            field=models.BooleanField(
                default=True,
                help_text='Personalized alerts based on tracked crops/regions',
            ),
        ),
    ]
