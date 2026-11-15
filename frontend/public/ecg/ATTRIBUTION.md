# ECG excerpt attribution

`nsrdb-16265.json` in this folder is a short excerpt of a real, recorded ECG.
It is **not** live sensor data and the application does **not** interpret it
(no rhythm reading, no heart rate is derived from it).

| | |
|---|---|
| Database | MIT-BIH Normal Sinus Rhythm Database, version 1.0.0 |
| Record | 16265, signal `ECG1` (first of two channels) |
| Source | PhysioNet, https://physionet.org/content/nsrdb/1.0.0/ |
| Licence | Open Data Commons Attribution License v1.0 (ODC-By 1.0), https://opendatacommons.org/licenses/by/1-0/ |
| Excerpt | 30 s, starting 43530 s after the start of the recording, at the native 128 Hz (3840 samples) |
| Processing | excerpt of 30 s, unit conversion only: ADC units to millivolts, `(adu - baseline) / gain` with gain 200 adu/mV and baseline 0 (from `16265.hea`), rounded to 3 decimals. No filtering, no resampling, no editing of samples. |

## Integrity

The source files `16265.hea` and `16265.dat` were checked against the
database's `SHA256SUMS.txt` before use:

- `16265.dat` sha256 `7e4571cada2f59d583ba173b2bd7e7ade1184f6dffcbd378014319f94a21111b`
- `16265.hea` sha256 `9ebd1511ce2f0adb75cb587f55c8160b582ca35cac82abac6317516631c20079`

The format-212 decoding was checked against the header's initial values and
16-bit signal checksums (ECG1 15756, ECG2 -21174). The raw `.dat`/`.hea` files
are not part of this repository.

The window was picked by simple signal statistics only (no clipping, low
baseline drift between 1 s medians, stable peak-to-peak amplitude, low
sample-to-sample noise), skipping the first 10 minutes of the recording. It was
not chosen by reading the rhythm.

## Citation

When using this excerpt, cite PhysioNet (standard PhysioNet platform
citation):

> Goldberger AL, Amaral LAN, Glass L, Hausdorff JM, Ivanov PCh, Mark RG,
> Mietus JE, Moody GB, Peng C-K, Stanley HE. PhysioBank, PhysioToolkit, and
> PhysioNet: Components of a new research resource for complex physiologic
> signals. Circulation 101(23):e215-e220, 2000.

and the database: MIT-BIH Normal Sinus Rhythm Database (version 1.0.0),
PhysioNet, https://physionet.org/content/nsrdb/1.0.0/.
