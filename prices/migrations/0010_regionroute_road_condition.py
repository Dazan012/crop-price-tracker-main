# Migration: Add road_condition field to RegionRoute

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('prices', '0009_userpreferences'),
    ]

    operations = [
        migrations.AddField(
            model_name='regionroute',
            name='road_condition',
            field=models.CharField(
                choices=[
                    ('good', 'Good (paved, well-maintained)'),
                    ('average', 'Average (some potholes, partially paved)'),
                    ('poor', 'Poor (unpaved, rough terrain)'),
                ],
                default='good',
                help_text='Human-readable road condition: good/average/poor',
                max_length=10,
            ),
        ),
    ]
