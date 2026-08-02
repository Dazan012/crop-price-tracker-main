from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('prices', '0012_userpreferences_notification_toggles'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='onboarding_complete',
            field=models.BooleanField(default=False, help_text='Whether user has completed the role onboarding wizard'),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='auth_provider',
            field=models.CharField(blank=True, choices=[('email', 'Email / Password'), ('google', 'Google OAuth'), ('phone', 'Phone OTP'), ('magic_link', 'Email Magic Link')], default='email', max_length=20),
        ),
        migrations.CreateModel(
            name='MagicLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(max_length=254)),
                ('token', models.CharField(max_length=64, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('used', models.BooleanField(default=False)),
            ],
        ),
        migrations.CreateModel(
            name='PhoneVerification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('phone', models.CharField(max_length=20)),
                ('code', models.CharField(max_length=6)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('used', models.BooleanField(default=False)),
                ('attempts', models.PositiveIntegerField(default=0)),
                ('last_channel', models.CharField(blank=True, max_length=20)),
                ('last_error', models.TextField(blank=True)),
            ],
        ),
    ]
