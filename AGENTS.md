# spaceapp-logar

Ortak kurallar için önce `/home/kuzey/RULES.md` dosyasını oku.

Ekip çalışma düzeni ve teknik belgeler:
- Git iş akışı: `docs/GIT_WORKFLOW.md`
- Ortak iş panosu: `docs/WORK_BOARD.md`
- Backend devir notu: `docs/HANDOFF.md`
- Biyolojik karar rehberi: `docs/biyo.md`
- Alarm kuralları: `docs/ALARM_RULES.md` ve `docs/DEMO_RULES.md`

[Antigravity, 14 Kasım 2026]
- Depo yerel ortama klonlandı (`/home/kuzey/Projeler/spaceapp-logar`).
- uv ile izole Python 3.12 çalışma ortamı oluşturuldu.
- Alembic veritabanı migration'ları uygulandı.
- Halil'e ve agent'ına frontend devir promptu iletildi.
- Frontend dev sunucuları için CORS desteği (5173 / 3000) senkronize edildi.
- GitHub Actions CI iş akışı eklendi (`.github/workflows/ci.yml`).
- 180 testin tamamı (180 passed) doğrulandı.
