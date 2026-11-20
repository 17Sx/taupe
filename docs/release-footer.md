
---

### Install

| System | File |
|---|---|
| macOS Apple Silicon (M1–M4) | `Taupe-…-mac-arm64.dmg` |
| macOS Intel | `Taupe-…-mac-x64.dmg` |
| Windows (installer) | `Taupe-…-win-x64-setup.exe` |
| Windows on ARM (installer) | `Taupe-…-win-arm64-setup.exe` |
| Windows (no install) | `Taupe-…-win-x64-portable.exe` |

**macOS** — the app is not notarized by Apple yet. On first launch: right-click Taupe → **Open**, or run this in Terminal:
`xattr -cr /Applications/Taupe.app`

**Windows** — SmartScreen may show "Windows protected your PC": click **More info → Run anyway**.

**Check your download** — `SHA256SUMS.txt` lists the SHA-256 of every file. macOS / Linux: `shasum -a 256 -c SHA256SUMS.txt --ignore-missing` · Windows (PowerShell): `Get-FileHash .\Taupe-…-setup.exe` and compare with the matching line.
