# Deployment Guide

This guide explains how to set up automated builds and releases for all platforms using GitHub Actions.

## 🚀 Quick Start

The workflow is already configured! It will:
- ✅ Build for **Windows** (x64)
- ✅ Build for **macOS** (Intel + Apple Silicon)
- ✅ Build for **Linux** (Ubuntu/AppImage/Deb)
- ✅ Create GitHub releases automatically
- ✅ Handle code signing (when configured)

## 📋 Prerequisites

1. Push your code to a GitHub repository
2. The workflow will run automatically on:
   - Every push to `main`/`master` branch
   - Every pull request
   - When you create a GitHub release

## 🔐 Code Signing Setup (Optional but Recommended)

### For Production Apps

Code signing ensures users trust your application and prevents security warnings.

#### Windows Code Signing
```bash
# You'll need a Windows code signing certificate (.p12 or .pfx file)
# Add these secrets to your GitHub repository:
```

#### macOS Code Signing
```bash
# You'll need an Apple Developer account and certificates
# Add these secrets to your GitHub repository:
```

#### Tauri Updater (Optional)
```bash
# For automatic app updates
# Generate a key pair for Tauri updater:
```

### GitHub Secrets Configuration

Go to your GitHub repository → Settings → Secrets and Variables → Actions

Add these secrets:

| Secret Name | Description | Required |
|-------------|-------------|----------|
| `APPLE_CERTIFICATE` | Base64 encoded Apple signing certificate | macOS signing |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the certificate | macOS signing |
| `APPLE_SIGNING_IDENTITY` | Apple Developer signing identity | macOS signing |
| `APPLE_ID` | Your Apple ID email | macOS notarization |
| `APPLE_PASSWORD` | App-specific password for Apple ID | macOS notarization |
| `APPLE_TEAM_ID` | Your Apple Developer Team ID | macOS signing |
| `TAURI_PRIVATE_KEY` | Base64 encoded private key for updater | Auto-updates |
| `TAURI_KEY_PASSWORD` | Password for the private key | Auto-updates |

## 🔧 Generating Code Signing Certificates

### macOS Code Signing

1. **Join Apple Developer Program** ($99/year)
2. **Create Certificates in Xcode or Apple Developer Portal:**
   ```bash
   # Create Developer ID Application certificate
   # Export as .p12 file with password
   ```

3. **Convert to Base64:**
   ```bash
   base64 -i certificate.p12 | pbcopy
   # Paste result into APPLE_CERTIFICATE secret
   ```

4. **Create App-Specific Password:**
   - Go to appleid.apple.com
   - Sign in → App-Specific Passwords
   - Generate password for GitHub Actions

### Windows Code Signing

1. **Get a Code Signing Certificate:**
   - Purchase from Sectigo, DigiCert, or other CA
   - Or use a self-signed certificate for testing

2. **Convert to Base64:**
   ```bash
   base64 -i certificate.p12 | clip
   # Paste result into WINDOWS_CERTIFICATE secret
   ```

### Linux

Linux builds don't require code signing, but you can optionally sign your packages.

## 🚀 Creating Releases

### Automatic Releases (Recommended)

1. **Create a Git Tag:**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **Create GitHub Release:**
   - Go to your repository → Releases
   - Click "Create a new release"
   - Choose your tag
   - The workflow will automatically build and attach files

### Manual Builds

Every push to `main` branch creates development builds that you can download from the Actions tab.

## 📦 Build Artifacts

After successful builds, you'll get:

### Windows
- `app-name_1.0.0_x64_en-US.msi` - Windows installer
- `app-name_1.0.0_x64.exe` - Portable executable

### macOS
- `app-name_1.0.0_aarch64.dmg` - Apple Silicon (M1/M2)
- `app-name_1.0.0_x64.dmg` - Intel Macs

### Linux
- `app-name_1.0.0_amd64.AppImage` - Universal Linux app
- `app-name_1.0.0_amd64.deb` - Debian/Ubuntu package

## 🛠 Customizing the Build

### Modify Build Targets

Edit `.github/workflows/build.yml`:

```yaml
# Add more platforms or remove ones you don't need
matrix:
  include:
    - platform: 'windows-latest'
      args: '--target x86_64-pc-windows-msvc'
    # Add more targets here
```

### Environment Variables

Add environment variables to the workflow:

```yaml
env:
  CUSTOM_VAR: 'value'
  API_URL: ${{ secrets.API_URL }}
```

## 🚨 Troubleshooting

### Common Issues

1. **Build Fails on macOS:**
   - Check Rust targets are installed
   - Verify Xcode Command Line Tools

2. **Linux Build Fails:**
   - Ensure all dependencies are installed
   - Check Ubuntu version compatibility

3. **Windows Build Fails:**
   - Verify Windows SDK is available
   - Check Visual Studio Build Tools

### Debug Builds

For debugging, you can run builds manually:

```bash
# Install dependencies
npm install

# Build for current platform
npm run tauri build

# Build with debug info
npm run tauri build -- --debug
```

## 📈 Monitoring Builds

- **Build Status:** Check the Actions tab in your GitHub repo
- **Build Logs:** Click on any workflow run to see detailed logs
- **Artifacts:** Download build artifacts from completed runs

## 🔄 Auto-Updates (Advanced)

To enable automatic app updates:

1. Generate update keys:
   ```bash
   npm run tauri signer generate -- -w ~/.tauri/key.key
   ```

2. Add the private key to GitHub secrets as `TAURI_PRIVATE_KEY`

3. Configure your app to check for updates

## 📝 Notes

- First build might take longer due to dependency caching
- Subsequent builds are much faster thanks to Rust and npm caching
- Code signing is optional but highly recommended for production
- The workflow runs on every push - consider limiting to specific branches if needed