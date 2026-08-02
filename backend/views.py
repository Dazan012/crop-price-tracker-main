from django.http import FileResponse, HttpResponseNotFound
from django.conf import settings
import os


def spa(request):
    path = os.path.join(settings.BASE_DIR, 'frontend', 'build', 'index.html')
    if os.path.exists(path):
        return FileResponse(open(path, 'rb'))
    return HttpResponseNotFound('Page not found')