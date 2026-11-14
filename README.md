# SpaceApp Logar

NASA Space Apps Challenge 2026 için geliştirilen açıklanabilir astronot sağlık
karar-destek aracı.

Projenin amacı astronotun sağlık ve çevre ölçümlerini birlikte izlemek, ölçümün
kişisel ve görev bağlamına göre dikkat gerektirip gerektirmediğini belirlemek ve
doğrulanmış eylem kartları sunmaktır. Sistem tıbbi teşhis koymaz ve serbest metin
tedavi üretmez.

## Backend'i çalıştırma

Gereksinimler: Python 3.12 ve [uv](https://docs.astral.sh/uv/).

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn spaceapp_logar.main:app --reload
```

API `http://127.0.0.1:8000` adresinde, etkileşimli dokümantasyon ise
`http://127.0.0.1:8000/docs` adresinde açılır. Operasyon kontrolü:

```bash
curl http://127.0.0.1:8000/health
```

Ana uçlar: `POST /v1/observations`, `POST /v1/check-ins`, `POST /v1/lab-results`,
`GET /v1/crew/{id}/status`, `GET /v1/crew/{id}/lab-results`, `GET /v1/alerts`,
`POST /v1/alerts/{id}/acknowledge`. Ayrıntı için
[API ve veri modeli](docs/API_DATA_MODEL.md).

Testleri çalıştırmak için:

```bash
uv run pytest
```

## Araştırma

- [Araştırma ve geliştirme planı](docs/RESEARCH_PLAN.md)
- [Challenge ve açık veri ön incelemesi](docs/DATA_AUDIT.md)
- [Birlikte çalışma biçimi ve onay noktaları](docs/COLLABORATION.md)
- [Git ile ortak çalışma düzeni](docs/GIT_WORKFLOW.md)
- [Ortak iş panosu](docs/WORK_BOARD.md)
- [Backend devir notu ve sıradaki işler](docs/HANDOFF.md)
- [MVP gösterge kısa listesi](docs/MVP_INDICATORS.md)
- [Backend teknoloji yığını seçenekleri](docs/BACKEND_STACK_OPTIONS.md)
- [Açıklanabilir alarm kuralları](docs/ALARM_RULES.md)
- [API ve veri modeli](docs/API_DATA_MODEL.md)
- [CO₂ WATCH eylem kartı taslağı](docs/CO2_ACTION_CARD_PROPOSAL.md)

## Temel kaynaklar

- [NASA Space Apps challenge](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=details)
- [NASA Open Science Data Repository](https://osdr.nasa.gov/bio/repo/search?q=&data_source=cgene,alsda,esa&data_type=study)
- [NASA Human Research Program](https://www.nasa.gov/hrp/)
