# Aynı `main` Dalında Ortak Çalışma Düzeni

Son güncelleme: 14 Kasım 2026

Ekip kararıyla Halil, `piebio` ve Codex aynı `main` dalında çalışır. Bu modelde
ayrı geliştirme dalı veya pull request zorunlu değildir. Güvenliğin temel kuralı
şudur: **aynı anda yalnızca bir kişi repoya yazar ve push eder.**

## Ana kural: `main` sırası

Çalışmaya başlayacak kişi ekip kanalına şu mesajı yazar:

```text
MAIN BENDE — <işin kısa adı> — <dokunulacak ana dosyalar>
```

Bu mesajdan `MAIN SERBEST` mesajına kadar diğer ekip üyeleri repoda dosya
değiştirmez veya commit oluşturmaz. Bu sırada araştırma, inceleme ve planlama
yapabilirler.

İş bitince sıra şu mesajla bırakılır:

```text
MAIN SERBEST — <commit kimliği> — <test sonucu> — <açık not>
```

## Çalışmaya başlama

Sırayı alan kişi kendi bilgisayarında önce çalışma ağacını ve ortak dalı kontrol
eder:

```bash
git status --short
git switch main
git fetch origin
git pull --ff-only origin main
```

`git status --short` beklenmedik dosya gösterirse değişiklikler silinmez veya
üzerine yazılmaz; önce kime ait olduğu belirlenir. `git pull --ff-only`
başarısız olursa zorla devam edilmez ve ekip bilgilendirilir.

## Değişiklik, test ve commit

Değişiklik küçük ve tek amaca odaklı tutulur. Backend davranışı değiştiğinde
normal doğrulama komutu çalıştırılır:

```bash
uv run pytest
```

Yalnızca işe ait dosyalar açıkça seçilir:

```bash
git status
git add path/to/file_a path/to/file_b
git commit -m "feat: kısa ve emir kipinde açıklama"
```

Commit önekleri:

- `feat:` yeni davranış;
- `fix:` hata düzeltmesi;
- `test:` yalnız test değişikliği;
- `docs:` yalnız belge değişikliği;
- `refactor:` davranışı değiştirmeyen kod düzenlemesi;
- `chore:` araç ve bakım işi.

## Push öncesi son kontrol

Commit'ten sonra başka birinin yanlışlıkla uzaktaki `main`i ilerletip
ilerletmediği kontrol edilir:

```bash
git fetch origin
git status --short
git rev-list --left-right --count HEAD...origin/main
```

Çıktının sağındaki sayı uzaktaki yeni commit sayısıdır. Normal durumda bu sayı
`0` olmalıdır; örneğin tek yerel commit için çıktı `1 0` olur. Sağdaki sayı
sıfır değilse push yapılmaz ve aşağıdaki ayrışma adımı uygulanır.

Uzak taraf ilerlememişse:

```bash
git push origin main
```

Push tamamlandıktan sonra commit kimliği ve test sonucu paylaşılıp `MAIN
SERBEST` denir.

## Beklenmedik ayrışma veya push reddi

`git push` non-fast-forward hatası verirse veya iki taraf da commit oluşturmuşsa
kesinlikle `--force` kullanılmaz. Önce ekip kanalında durum bildirilir. Yerel,
henüz push edilmemiş commit güncel ortak geçmişin üzerine şu şekilde taşınır:

```bash
git fetch origin
git rebase origin/main
uv run pytest
git push origin main
```

Rebase sırasında çakışma çıkarsa dosyanın hangi davranışı koruyacağı iki
geliştirici tarafından kararlaştırılır. Emin olunamazsa işlem şu komutla güvenle
iptal edilir:

```bash
git rebase --abort
```

Çakışma çözüldüğünde ilgili dosyalar `git add` ile işaretlenir ve `git rebase
--continue` çalıştırılır. Test geçmeden push yapılmaz.

## Codex ile çalışma

Codex de aynı sıraya uyar. Kod yazmadan önce uzak `main`i kontrol eder, yaptığı
işi ve dosya sınırını bildirir, test çalıştırır ve commit oluşturur. Kullanıcı
açıkça istemedikçe Codex push yapmaz; commit hazır olduğunda push komutunu Halil
çalıştırır.

## Kesinlikle yapılmayacaklar

- `main` dalına force-push yapmak;
- başkasının beklenmedik yerel değişikliklerini silmek;
- test sonucunu paylaşmadan backend commit'i devretmek;
- `MAIN BENDE` sırası başka birindeyken repo dosyalarını değiştirmek;
- büyük ve ilgisiz değişiklikleri tek commit'te toplamak.
