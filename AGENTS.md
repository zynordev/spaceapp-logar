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
- SQLite eşzamanlı okuma/yazma kilitlenmesini önlemek için WAL modu ve busy_timeout yapılandırıldı.
- 195 testin tamamı (195 passed) doğrulandı.
- Canlı dağıtım için Dockerfile ve Render Blueprint (`render.yaml`) yapılandırması eklendi.
- NASA Space Apps resmi teslim paketi hazırlandı (`docs/SUBMISSION.md`): 7 slaytlık İngilizce Pitch Deck, Proje Başvuru Metni, AI Şeffaflık Beyanı ve 30 saniyelik video senaryosu.
