from django.contrib import admin
from django.urls import path, include
from . import views as backend_views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('prices.urls')),
    path('', backend_views.spa),
    path('<path:path>', backend_views.spa),
]